import { EarningsNotifierUseCase } from '../../../features/earnings_notifier/usecase';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { MarketDataService, EarningsEvent } from '../../../features/earnings_notifier/services/market_data_service';
import { NotificationService } from '../../../core/services/notification_service';

// Mock Logger
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('EarningsNotifierUseCase', () => {
    let useCase: EarningsNotifierUseCase;
    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let mockMarketDataService: jest.Mocked<MarketDataService>;
    let mockNotificationService: jest.Mocked<NotificationService>;

    beforeEach(() => {
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        };
        mockMarketDataService = {
            getEarningsCalendar: jest.fn()
        };
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };

        useCase = new EarningsNotifierUseCase(
            mockWatchlistService,
            mockMarketDataService,
            mockNotificationService
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('execute_emptyWatchlist_skips', async () => {
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        await useCase.execute();

        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalled();
        expect(mockMarketDataService.getEarningsCalendar).not.toHaveBeenCalled();
    });

    it('execute_validEarnings_filtersAndNotifies', async () => {
        // Mock Date: 2023-10-01 12:00 (Noon UTC) -> Safe for US timezones to still be 10-01
        const mockToday = new Date('2023-10-01T12:00:00Z');
        jest.useFakeTimers().setSystemTime(mockToday);

        const watchlist = new Map([['AAPL', 'Apple Inc.']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const event: EarningsEvent = {
            symbol: 'AAPL',
            date: '2023-10-01', // Today
            epsActual: null,
            epsEstimated: null,
            revenueActual: null,
            revenueEstimated: null,
            lastUpdated: '2023-10-01'
        };
        mockMarketDataService.getEarningsCalendar.mockResolvedValue([event]);

        await useCase.execute();

        expect(mockMarketDataService.getEarningsCalendar).toHaveBeenCalled();
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL Earnings Update',
            'Apple Inc. is releasing their earnings today!',
            expect.objectContaining({ type: 'earnings_reminder', daysRemaining: '0' })
        );
    });

    it('execute_futureEarnings_calculatesDaysDiff', async () => {
        // Mock Date: 2023-10-01 12:00 UTC
        const mockToday = new Date('2023-10-01T12:00:00Z');
        jest.useFakeTimers().setSystemTime(mockToday);

        const watchlist = new Map([['AAPL', 'Apple Inc.']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const event: EarningsEvent = {
            symbol: 'AAPL',
            date: '2023-10-02', // Tomorrow (1 day diff)
            epsActual: null,
            epsEstimated: null,
            revenueActual: null,
            revenueEstimated: null,
            lastUpdated: '2023-10-01'
        };
        mockMarketDataService.getEarningsCalendar.mockResolvedValue([event]);

        await useCase.execute();

        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            'AAPL',
            'AAPL Earnings Update',
            'Apple Inc. is releasing their earnings in 1 day!',
            expect.objectContaining({ type: 'earnings_reminder', daysRemaining: '1' })
        );
    });

    it('execute_unwatchedEarnings_ignored', async () => {
        const watchlist = new Map([['AAPL', 'Apple Inc.']]);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(watchlist);

        const event: EarningsEvent = {
            symbol: 'GOOG', // Not watched
            date: '2023-10-01',
            epsActual: null,
            epsEstimated: null,
            revenueActual: null,
            revenueEstimated: null,
            lastUpdated: '2023-10-01'
        };
        mockMarketDataService.getEarningsCalendar.mockResolvedValue([event]);

        await useCase.execute();

        expect(mockNotificationService.sendTopicNotification).not.toHaveBeenCalled();
    });
});
