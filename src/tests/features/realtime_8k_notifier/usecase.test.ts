import { Realtime8kNotifierUseCase } from '../../../features/realtime_8k_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { NotificationService } from '../../../core/services/notification_service';
import { SecService, SecFiling } from '../../../core/services/sec_service';
import { FilingHistoryService } from '../../../core/services/filing_history_service';
import { AiService } from '../../../core/services/ai_service';
import * as firebaseCore from '../../../core/firebase';
import * as admin from 'firebase-admin';

jest.mock('../../../core/firebase');
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

    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let mockSecService: jest.Mocked<SecService>;
    let mockFilingHistoryService: jest.Mocked<FilingHistoryService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockAiService: jest.Mocked<AiService>;

    let mockFirestoreAdd: jest.Mock;

    beforeEach(() => {
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

        mockFirestoreAdd = jest.fn();
        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: () => ({
                    add: mockFirestoreAdd
                })
            })
        });

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
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        // Act
        await useCase.execute();

        // Assert
        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalled();
        expect(mockSecService.getFilings).not.toHaveBeenCalled();
    });

    it('execute_noFilingsForToday_doesNothing', async () => {
        // Arrange
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);
        mockSecService.getFilings.mockResolvedValue([]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockSecService.getFilings).toHaveBeenCalledWith('8-K', expect.any(String), expect.any(String));
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_filingNotWatched_skipsProcessing', async () => {
        // Arrange
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

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.hasProcessed).not.toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_filingAlreadyProcessed_skipsProcessing', async () => {
        // Arrange
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

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.hasProcessed).toHaveBeenCalledWith(filing);
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    it('execute_aiReturnsNull_marksProcessedAndSkips', async () => {
        // Arrange
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
        mockAiService.enrich8k.mockResolvedValue(null);

        // Act
        await useCase.execute();

        // Assert
        expect(mockAiService.enrich8k).toHaveBeenCalled();
        expect(mockFilingHistoryService.markProcessed).toHaveBeenCalledWith(filing);
        expect(mockFirestoreAdd).not.toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_relevantFiling_sendsNotification', async () => {
        // Arrange
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

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreAdd).toHaveBeenCalledWith(expect.objectContaining({
            symbol: 'AAPL',
            topic: 'M&A',
            summary: 'Apple buys startup.'
        }));

        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL Breaking News',
            'Apple buys startup.',
            expect.objectContaining({
                type: '8k_filing',
                topic: 'M&A'
            })
        );

        expect(mockFilingHistoryService.markProcessed).toHaveBeenCalledWith(filing);
    });
});
