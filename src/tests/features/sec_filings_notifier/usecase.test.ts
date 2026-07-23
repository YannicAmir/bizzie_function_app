import { SecFilingsNotifierUseCase } from '../../../features/sec_filings_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { NotificationService } from '../../../core/services/notification_service';
import { SecService, SecFiling } from '../../../core/services/sec_service';
import { FilingHistoryService } from '../../../core/services/filing_history_service';
import { AiService } from '../../../core/services/ai_service';
import { SecFilingsRepository } from '../../../core/services/sec_filings_repository';

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
    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let mockSecService: jest.Mocked<SecService>;
    let mockFilingHistoryService: jest.Mocked<FilingHistoryService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockAiService: jest.Mocked<AiService>;
    let mockSecFilingsRepository: jest.Mocked<SecFilingsRepository>;

    beforeEach(() => {
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        };
        mockSecService = {
            getFilings: jest.fn(),
            getFilingText: jest.fn()
        };
        mockFilingHistoryService = {
            claimForProcessing: jest.fn(),
            markSent: jest.fn(),
            releaseClaim: jest.fn()
        };
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };
        mockAiService = {
            enrich8k: jest.fn(),
            enrichFinancialReport: jest.fn(),
            enrichDeepFinancialReport: jest.fn()
        };

        mockSecFilingsRepository = {
            save: jest.fn(),
            saveEnriched8k: jest.fn()
        };

        useCase = new SecFilingsNotifierUseCase(
            mockWatchlistService,
            mockSecService,
            mockFilingHistoryService,
            mockNotificationService,
            mockAiService,
            mockSecFilingsRepository
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
        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalledWith(300);
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
            symbol: 'GOOG',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            period: 'Q3',
            link: 'http://link',
            finalLink: 'http://final',
            formType: '10-Q',
            cik: '12345'
        };
        mockSecService.getFilings.mockResolvedValueOnce([]).mockResolvedValueOnce([filing]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.claimForProcessing).not.toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });

    it('execute_claimFails_skipsProcessing', async () => {
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

        mockFilingHistoryService.claimForProcessing.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.claimForProcessing).toHaveBeenCalledWith(filing);
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);

        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw 10-Q Content' });
        mockAiService.enrichFinancialReport.mockResolvedValue({
            revenue: 100000000000,
            eps: 1.50,
            reportingCurrency: 'USD',
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
            "AAPL's 10-Q is now available",
            'Apple had a great quarter due to iPhone sales.', // AI Summary
            expect.objectContaining({
                type: 'sec_filing',
                ticker: 'AAPL',
                formType: '10-Q'
            })
        );

        // 3. DB Save
        expect(mockSecFilingsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
            filing: expect.objectContaining({ symbol: 'AAPL', formType: '10-Q' }),
            companyName: 'Apple',
            link: 'http://final',
            enriched: expect.objectContaining({
                summary: 'Apple had a great quarter due to iPhone sales.',
                revenue: 100000000000,
                eps: 1.50
            })
        }));

        // 4. Mark Processed
        expect(mockFilingHistoryService.markSent).toHaveBeenCalledWith(filing);
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
        mockSecService.getFilings.mockResolvedValueOnce([filing]).mockResolvedValueOnce([]);
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);

        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw Content' });
        mockAiService.enrichFinancialReport.mockRejectedValue(new Error('AI Service Down'));

        // Act
        await useCase.execute();

        // Assert
        const fallbackSummary = '10-K filed.';
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            expect.any(String),
            fallbackSummary,
            expect.any(Object)
        );

        expect(mockSecFilingsRepository.save).toHaveBeenCalled();
        expect(mockFilingHistoryService.markSent).toHaveBeenCalledWith(filing);
    });

    it('execute_sendThrows_releasesClaim', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw Content' });
        mockAiService.enrichFinancialReport.mockResolvedValue({
            revenue: 1,
            eps: 1,
            reportingCurrency: 'USD',
            summary: 'ok'
        });
        mockNotificationService.sendTopicNotification.mockRejectedValue(new Error('fcm down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.releaseClaim).toHaveBeenCalledWith(filing);
        expect(mockFilingHistoryService.markSent).not.toHaveBeenCalled();
    });

    it('execute_success_persistsBeforeNotifying', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw Content' });
        mockAiService.enrichFinancialReport.mockResolvedValue({
            revenue: 1, eps: 1, reportingCurrency: 'USD', summary: 'ok'
        });

        // Act
        await useCase.execute();

        // Assert — persistence must complete before the (irreversible) notification
        const saveOrder = mockSecFilingsRepository.save.mock.invocationCallOrder[0];
        const notifyOrder = mockNotificationService.sendTopicNotification.mock.invocationCallOrder[0];
        expect(saveOrder).toBeLessThan(notifyOrder!);
    });

    it('execute_persistThrows_doesNotNotifyAndReleasesClaim', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw Content' });
        mockAiService.enrichFinancialReport.mockResolvedValue({
            revenue: 1, eps: 1, reportingCurrency: 'USD', summary: 'ok'
        });
        mockSecFilingsRepository.save.mockRejectedValue(new Error('firestore down'));

        // Act
        await useCase.execute();

        // Assert — a persistence failure must not leave the user notified for an unsaved filing
        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
        expect(mockFilingHistoryService.releaseClaim).toHaveBeenCalledWith(filing);
        expect(mockFilingHistoryService.markSent).not.toHaveBeenCalled();
    });
});
