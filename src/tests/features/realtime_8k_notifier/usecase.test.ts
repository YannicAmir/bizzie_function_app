import { Realtime8kNotifierUseCase } from '../../../features/realtime_8k_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { NotificationService } from '../../../core/services/notification_service';
import { SecService, SecFiling } from '../../../core/services/sec_service';
import { FilingHistoryService } from '../../../core/services/filing_history_service';
import { SecFilingsRepository } from '../../../core/services/sec_filings_repository';
import { AiService } from '../../../core/services/ai_service';

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
    let mockSecFilingsRepository: jest.Mocked<SecFilingsRepository>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockAiService: jest.Mocked<AiService>;

    beforeEach(() => {
        mockWatchlistService = { getAllWatchedTickers: jest.fn() };
        mockSecService = { getFilings: jest.fn(), getFilingText: jest.fn() };
        mockFilingHistoryService = { claimForProcessing: jest.fn(), markSent: jest.fn(), releaseClaim: jest.fn() };
        mockSecFilingsRepository = { save: jest.fn(), saveEnriched8k: jest.fn() };
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };
        mockAiService = { enrich8k: jest.fn(), enrichFinancialReport: jest.fn(), enrichDeepFinancialReport: jest.fn() };

        useCase = new Realtime8kNotifierUseCase(
            mockWatchlistService,
            mockSecService,
            mockFilingHistoryService,
            mockSecFilingsRepository,
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
        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalledWith(300);
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
        expect(mockSecService.getFilings).toHaveBeenCalledWith({
            type: '8-K',
            startDate: expect.any(String),
            endDate: expect.any(String),
            sinceAcceptedDate: expect.any(String)
        });
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
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.claimForProcessing).toHaveBeenCalledWith(filing);
        expect(mockSecService.getFilingText).not.toHaveBeenCalled();
    });

    it('execute_filingTextUnavailable_releasesClaim', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'unavailable' });

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.releaseClaim).toHaveBeenCalledWith(filing);
        expect(mockAiService.enrich8k).not.toHaveBeenCalled();
        expect(mockFilingHistoryService.markSent).not.toHaveBeenCalled();
    });

    it('execute_filingTextEmpty_marksSentWithoutRetry', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'empty' });

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.markSent).toHaveBeenCalledWith(filing);
        expect(mockAiService.enrich8k).not.toHaveBeenCalled();
        expect(mockFilingHistoryService.releaseClaim).not.toHaveBeenCalled();
    });

    it('execute_aiReturnsNull_marksSentAndSkips', async () => {
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);

        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw 8-K Text' });
        mockAiService.enrich8k.mockResolvedValue(null);

        // Act
        await useCase.execute();

        // Assert
        expect(mockAiService.enrich8k).toHaveBeenCalled();
        expect(mockFilingHistoryService.markSent).toHaveBeenCalledWith(filing);
        expect(mockSecFilingsRepository.saveEnriched8k).not.toHaveBeenCalled();
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
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw 8-K Text' });

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
        expect(mockSecFilingsRepository.saveEnriched8k).toHaveBeenCalledWith(expect.objectContaining({
            filing,
            companyName: 'Apple',
            link: 'http://final',
            enriched: expect.objectContaining({
                topic: 'M&A',
                summary: 'Apple buys startup.'
            })
        }));

        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL Breaking News',
            'Apple buys startup.',
            expect.objectContaining({
                type: 'sec_filing',
                formType: '8-K',
                topic: 'M&A'
            })
        );

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
            link: 'http://link',
            finalLink: 'http://final',
            formType: '8-K',
            cik: '54321'
        };
        mockSecService.getFilings.mockResolvedValue([filing]);
        mockFilingHistoryService.claimForProcessing.mockResolvedValue(true);
        mockSecService.getFilingText.mockResolvedValue({ status: 'ok', text: 'Raw 8-K Text' });
        mockAiService.enrich8k.mockResolvedValue({
            topic: 'M&A',
            isEarnings: false,
            summary: 'Apple buys startup.',
            sentiment: 'Positive',
            revenue: null,
            eps: null
        });
        mockNotificationService.sendTopicNotification.mockRejectedValue(new Error('fcm down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFilingHistoryService.releaseClaim).toHaveBeenCalledWith(filing);
        expect(mockFilingHistoryService.markSent).not.toHaveBeenCalled();
    });
});
