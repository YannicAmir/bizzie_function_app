import { PreviousCloseResolver } from '../../../features/stock_price_sync/previous_close';
import { FmpEodService } from '../../../features/stock_price_sync/services/fmp_eod_service';
import { StockPricesConfig } from '../../../core/remote-config';
import { DailyClose } from '../../../features/stock_price_sync/models/DailyClose';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

const TODAY = '2026-01-06';

const cfg: StockPricesConfig = {
    fetchConcurrency: 2,
    maxCallsPerRun: 0,
    watchlistCacheSeconds: 300,
    seriesBucketMinutes: 5,
    eodLookbackCalendarDays: 4,
    eodFallbackCalendarDays: 10
};

const eod = (date: string, close: number): DailyClose => ({ date, close });

describe('PreviousCloseResolver', () => {
    let mockEodService: jest.Mocked<FmpEodService>;
    let resolver: PreviousCloseResolver;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockEodService = {
            fetchDailyCloses: jest.fn()
        } as unknown as jest.Mocked<FmpEodService>;
        resolver = new PreviousCloseResolver(mockEodService);
    });

    it('resolve_narrowWindowHasPriorClose_returnsWithoutWidening', async () => {
        // Arrange
        mockEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);

        // Act
        const result = await resolver.resolve('N1', cfg, TODAY);

        // Assert
        expect(mockEodService.fetchDailyCloses).toHaveBeenCalledTimes(1);
        expect(mockEodService.fetchDailyCloses).toHaveBeenCalledWith('N1', { from: '2026-01-02', to: TODAY });
        expect(result).toEqual({ previousClose: 100, todayClose: null });
    });

    it('resolve_narrowWindowEmpty_widensLookup', async () => {
        // Arrange
        mockEodService.fetchDailyCloses
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([eod('2025-12-31', 40)]);

        // Act
        const result = await resolver.resolve('N2', cfg, TODAY);

        // Assert
        expect(mockEodService.fetchDailyCloses).toHaveBeenCalledTimes(2);
        expect(mockEodService.fetchDailyCloses).toHaveBeenNthCalledWith(2, 'N2', { from: '2025-12-27', to: TODAY });
        expect(result).toEqual({ previousClose: 40, todayClose: null });
    });

    it('resolve_todayRecordPresent_returnsTodayClose', async () => {
        // Arrange
        mockEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100), eod('2026-01-06', 110)]);

        // Act
        const result = await resolver.resolve('N3', cfg, TODAY);

        // Assert
        expect(result).toEqual({ previousClose: 100, todayClose: 110 });
    });

    it('resolve_multiplePriorRecords_picksNewestBeforeToday', async () => {
        // Arrange
        mockEodService.fetchDailyCloses.mockResolvedValue([
            eod('2026-01-02', 95),
            eod('2026-01-05', 100),
            eod('2026-01-06', 110)
        ]);

        // Act
        const result = await resolver.resolve('N4', cfg, TODAY);

        // Assert
        expect(result).toEqual({ previousClose: 100, todayClose: 110 });
    });

    it('resolveCachedPreviousClose_cacheMiss_fetchesThenServesFromCache', async () => {
        // Arrange
        mockEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);

        // Act
        const first = await resolver.resolveCachedPreviousClose('C1', cfg, TODAY);
        const second = await resolver.resolveCachedPreviousClose('C1', cfg, TODAY);

        // Assert
        expect(first).toBe(100);
        expect(second).toBe(100);
        expect(mockEodService.fetchDailyCloses).toHaveBeenCalledTimes(1);
    });

    it('resolveCachedPreviousClose_cacheHit_returnsWithoutFetching', async () => {
        // Arrange
        resolver.cache('C2', TODAY, 77);

        // Act
        const result = await resolver.resolveCachedPreviousClose('C2', cfg, TODAY);

        // Assert
        expect(result).toBe(77);
        expect(mockEodService.fetchDailyCloses).not.toHaveBeenCalled();
    });

    it('resolveCachedPreviousClose_eodFails_returnsNullWithoutCaching', async () => {
        // Arrange
        mockEodService.fetchDailyCloses.mockRejectedValue(new Error('eod down'));

        // Act
        const result = await resolver.resolveCachedPreviousClose('C3', cfg, TODAY);

        // Assert
        expect(result).toBeNull();
        expect(resolver.isFresh('C3', TODAY)).toBe(false);
    });

    it('isFresh_afterCache_trueForSameSessionOnly', () => {
        // Arrange
        resolver.cache('F1', TODAY, 100);

        // Act & Assert
        expect(resolver.isFresh('F1', TODAY)).toBe(true);
        expect(resolver.isFresh('F1', '2026-01-07')).toBe(false);
        expect(resolver.isFresh('UNKNOWN', TODAY)).toBe(false);
    });
});
