import { SecFilingsNotifierUseCase } from '../../../features/sec_filings_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { NotificationService } from '../../../core/services/notification_service';
import { SecService, SecFiling } from '../../../core/services/sec_service';
import { FilingHistoryService } from '../../../core/services/filing_history_service';
import { AiService } from '../../../core/services/ai_service';
import * as firebaseCore from '../../../core/firebase';

// Mock dependencies
jest.mock('../../../core/firebase');
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('SecFilingsNotifierUseCase', () => {
    let useCase: SecFilingsNotifierUseCase;
    // Mock Services
    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let mockSecService: jest.Mocked<SecService>;
    let mockFilingHistoryService: jest.Mocked<FilingHistoryService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockAiService: jest.Mocked<AiService>;

    // Mock Firebase
    let mockFirestoreAdd: jest.Mock;

    beforeEach(() => {
        // Initialize Mocks
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        };
        mockSecService = {
            getFilings: jest.fn(),
            getFilingText: jest.fn()
        };
        mockFilingHistoryService = {
            hasProcessed: jest.fn(),
            markProcessed: jest.fn()
        };
        mockNotificationService = {
            sendTopicNotification: jest.fn()
        };
        mockAiService = {
            enrich8k: jest.fn(),
            enrichFinancialReport: jest.fn()
        };

        // Initialize Firestore Mock
        mockFirestoreAdd = jest.fn();
        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: () => ({
                    add: mockFirestoreAdd
                })
            })
        });

        useCase = new SecFilingsNotifierUseCase(
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
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map()); // Empty

        // Act
        await useCase.execute();

        // Assert
        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalled();
        expect(mockSecService.getFilings).not.toHaveBeenCalled(); // Should exit early
    });

    it('execute_noFilings_logsAndExits', async () => {
        // Arrange
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        mockSecService.getFilings.mockResolvedValue([]); // No filings found

        // Act
        await useCase.execute();

        // Assert
        expect(mockSecService.getFilings).toHaveBeenCalledTimes(2); // 10-K AND 10-Q
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_filingNotWatched_skipsProcessing', async () => {
        // Arrange
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'GOOG', // Not in watchlist
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            period: 'Q3',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '10-Q',
            cik: '12345'
        };
        mockSecService.getFilings.mockResolvedValueOnce([]).mockResolvedValueOnce([filing]); // Return for 10-Q

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.hasProcessed).not.toHaveBeenCalled(); // Optimization check
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
            period: 'Q3',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '10-Q',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValueOnce([]).mockResolvedValueOnce([filing]);

        mockFilingHistoryService.hasProcessed.mockResolvedValue(true); // Already processed

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.hasProcessed).toHaveBeenCalledWith(filing);
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_newFiling_processesSuccessfully', async () => {
        // Arrange
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            period: 'Q3',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '10-Q',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValueOnce([]).mockResolvedValueOnce([filing]);
        mockFilingHistoryService.hasProcessed.mockResolvedValue(false); // New filing

        mockSecService.getFilingText.mockResolvedValue('Raw 10-Q Content');
        mockAiService.enrichFinancialReport.mockResolvedValue({
            revenue: '$100B',
            eps: '$1.50',
            summary: 'Apple had a great quarter due to iPhone sales.'
        });

        // Act
        await useCase.execute();

        // Assert
        // 1. AI Enrichment
        expect(mockSecService.getFilingText).toHaveBeenCalledWith('http://final');
        expect(mockAiService.enrichFinancialReport).toHaveBeenCalledWith('Raw 10-Q Content', '10-Q');

        // 2. Notification
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL SEC Filing Update',
            'Apple had a great quarter due to iPhone sales.', // AI Summary
            expect.objectContaining({
                type: 'sec_filing',
                ticker: 'AAPL',
                formType: '10-Q'
            })
        );

        // 3. DB Save
        expect(mockFirestoreAdd).toHaveBeenCalledWith(expect.objectContaining({
            symbol: 'AAPL',
            summary: 'Apple had a great quarter due to iPhone sales.',
            revenue: '$100B',
            eps: '$1.50'
        }));

        // 4. Mark Processed
        expect(mockFilingHistoryService.markProcessed).toHaveBeenCalledWith(filing);
    });

    it('execute_aiFailure_usesFallbackSummary', async () => {
        // Arrange
        const watchlist = new Map([['AAPL', 'Apple']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const filing: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            period: 'FY',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '10-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValueOnce([filing]).mockResolvedValueOnce([]); // 10-K
        mockFilingHistoryService.hasProcessed.mockResolvedValue(false);

        // AI Failure
        mockSecService.getFilingText.mockResolvedValue('Raw Content');
        mockAiService.enrichFinancialReport.mockRejectedValue(new Error('AI Service Down'));

        // Act
        await useCase.execute();

        // Assert
        // Should fallback to default summary format
        const fallbackSummary = '10-K filed.';
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            expect.any(String),
            fallbackSummary, // Default
            expect.any(Object)
        );

        // DB should save valid filing but potentially null metrics or fallback summary
        expect(mockFirestoreAdd).toHaveBeenCalled(); // We expect it to save even if AI fails
    });
});
