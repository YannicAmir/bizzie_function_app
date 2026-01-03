import { Realtime8kNotifierUseCase } from '../../../features/realtime_8k_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { NotificationService } from '../../../core/services/notification_service';
import { SecService, SecFiling } from '../../../core/services/sec_service';
import { FilingHistoryService } from '../../../core/services/filing_history_service';
import { AiService } from '../../../core/services/ai_service';
import * as firebaseCore from '../../../core/firebase';
import * as admin from 'firebase-admin';

// Mock dependencies
jest.mock('../../../core/firebase');
// Mock the entire logger module to return a mock class
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('Realtime8kNotifierUseCase', () => {
    let useCase: Realtime8kNotifierUseCase;

    // Services
    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let mockSecService: jest.Mocked<SecService>;
    let mockFilingHistoryService: jest.Mocked<FilingHistoryService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockAiService: jest.Mocked<AiService>;

    // Firestore
    let mockFirestoreAdd: jest.Mock;

    beforeEach(() => {
        // Initialize Mocks
        mockWatchlistService = { getAllWatchedTickers: jest.fn() };
        mockSecService = { getFilings: jest.fn(), getFilingText: jest.fn() };
        mockFilingHistoryService = { hasProcessed: jest.fn(), markProcessed: jest.fn() };
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };
        mockAiService = { enrich8k: jest.fn(), enrichFinancialReport: jest.fn(), enrichDeepFinancialReport: jest.fn() };

        // Firebase Mock
        mockFirestoreAdd = jest.fn();
        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: () => ({
                    add: mockFirestoreAdd
                })
            })
        });

        // Add serverTimestamp mock if needed (though typically handled by mocking firebase-admin or just accepting calls)
        // We can just rely on the import * as admin above if we're not executing it directly, 
        // but often it's better to mock FieldValue
        Object.defineProperty(admin.firestore, 'FieldValue', {
            value: {
                serverTimestamp: jest.fn().mockReturnValue('SERVER_TIMESTAMP')
            },
            writable: true
        });

        useCase = new Realtime8kNotifierUseCase(
            mockWatchlistService,
            mockSecService,
            mockFilingHistoryService,
            mockNotificationService,
            mockAiService
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('execute_watchlistEmpty_logsAndExits', async () => {
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        await useCase.execute();

        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalled();
        expect(mockSecService.getFilings).not.toHaveBeenCalled();
    });

    it('execute_noFilingsForToday_doesNothing', async () => {
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);
        mockSecService.getFilings.mockResolvedValue([]);

        await useCase.execute();

        expect(mockSecService.getFilings).toHaveBeenCalledWith('8-K', expect.any(String), expect.any(String));
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_filingNotWatched_skipsProcessing', async () => {
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'GOOG',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '12345'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);

        await useCase.execute();

        expect(mockFilingHistoryService.hasProcessed).not.toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_filingAlreadyProcessed_skipsProcessing', async () => {
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);
        mockFilingHistoryService.hasProcessed.mockResolvedValue(true);

        await useCase.execute();

        expect(mockFilingHistoryService.hasProcessed).toHaveBeenCalledWith(filing);
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    it('execute_aiReturnsNull_marksProcessedAndSkips', async () => {
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);
        mockFilingHistoryService.hasProcessed.mockResolvedValue(false);

        mockSecService.getFilingText.mockResolvedValue('Raw 8-K Text');
        mockAiService.enrich8k.mockResolvedValue(null); // Invalid/Irrelevant topic

        await useCase.execute();

        expect(mockAiService.enrich8k).toHaveBeenCalled();
        // Should mark processed to avoid loop
        expect(mockFilingHistoryService.markProcessed).toHaveBeenCalledWith(filing);
        // But should NOT notify or save to DB (useCase logic: if !enriched continue; after marking processed?)
        // Let's check logic:
        // if (!enriched) { await markProcessed(); continue; }
        expect(mockFirestoreAdd).not.toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_relevantFiling_sendsNotification', async () => {
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);
        mockFilingHistoryService.hasProcessed.mockResolvedValue(false);
        mockSecService.getFilingText.mockResolvedValue('Raw 8-K Text');

        mockAiService.enrich8k.mockResolvedValue({
            topic: 'M&A',
            isEarnings: false,
            summary: 'Apple buys startup.',
            sentiment: 'Positive',
            revenue: null,
            eps: null
        });

        await useCase.execute();

        // 1. DB Save
        expect(mockFirestoreAdd).toHaveBeenCalledWith(expect.objectContaining({
            symbol: 'AAPL',
            topic: 'M&A',
            summary: 'Apple buys startup.'
        }));

        // 2. Notification
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL Breaking News',
            'Apple buys startup.',
            expect.objectContaining({
                type: '8k_filing',
                topic: 'M&A'
            })
        );

        // 3. Mark Processed
        expect(mockFilingHistoryService.markProcessed).toHaveBeenCalledWith(filing);
    });
});
