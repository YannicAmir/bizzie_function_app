import { StockPriceSyncUseCase } from '../../../features/stock_price_sync/usecase';
import { PreviousCloseResolver } from '../../../features/stock_price_sync/previous_close';
import { FmpChartService } from '../../../features/stock_price_sync/services/fmp_chart_service';
import { FmpEodService } from '../../../features/stock_price_sync/services/fmp_eod_service';
import { FirestoreService } from '../../../features/stock_price_sync/services/firestore_service';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { getRemoteConfig, StockPricesConfig } from '../../../core/remote-config';
import { DailyClose } from '../../../features/stock_price_sync/models/DailyClose';
import { IntradayBar } from '../../../features/stock_price_sync/models/IntradayBar';

jest.mock('../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn()
}));
jest.mock('../../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

const baseCfg: StockPricesConfig = {
    fetchConcurrency: 2,
    maxCallsPerRun: 0,
    watchlistCacheSeconds: 300,
    seriesBucketMinutes: 5,
    eodLookbackCalendarDays: 4,
    eodFallbackCalendarDays: 10
};

// ET phase windows (America/New_York, UTC−5 in January):
const INTRADAY_UTC = new Date('2026-01-06T15:00:00Z');  // 10:00 ET → intraday, session 2026-01-06
const IDLE_UTC = new Date('2026-01-06T12:00:00Z');      // 07:00 ET → idle
const SEED_UTC = new Date('2026-01-06T14:20:00Z');      // 09:20 ET → pre-open seed
const FINALIZE_UTC = new Date('2026-01-06T21:30:00Z');  // 16:30 ET → post-close finalize
const TODAY = '2026-01-06';

const makeBar = (date: string, close: number): IntradayBar => ({
    date,
    open: close,
    low: close,
    high: close,
    close,
    volume: 100
});

const eod = (date: string, close: number): DailyClose => ({ date, close });

describe('StockPriceSyncUseCase', () => {
    let useCase: StockPriceSyncUseCase;
    let mockFmpChartService: jest.Mocked<FmpChartService>;
    let mockFmpEodService: jest.Mocked<FmpEodService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;
    let mockWatchlistService: jest.Mocked<WatchlistService>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        jest.useFakeTimers().setSystemTime(INTRADAY_UTC);
        (getRemoteConfig as jest.Mock).mockResolvedValue({ stock_prices: baseCfg });
        mockFmpChartService = {
            fetchIntradayBars: jest.fn()
        } as unknown as jest.Mocked<FmpChartService>;
        mockFmpEodService = {
            fetchDailyCloses: jest.fn().mockResolvedValue([eod('2026-01-05', 100)])
        } as unknown as jest.Mocked<FmpEodService>;
        mockFirestoreService = {
            upsertPrice: jest.fn().mockResolvedValue(undefined)
        } as unknown as jest.Mocked<FirestoreService>;
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        } as jest.Mocked<WatchlistService>;
        useCase = new StockPriceSyncUseCase(
            mockFmpChartService,
            new PreviousCloseResolver(mockFmpEodService),
            mockFirestoreService,
            mockWatchlistService
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('execute_idlePhase_skipsRun', async () => {
        // Arrange
        jest.setSystemTime(IDLE_UTC);

        // Act
        await useCase.execute();

        // Assert
        expect(getRemoteConfig).not.toHaveBeenCalled();
        expect(mockWatchlistService.getAllWatchedTickers).not.toHaveBeenCalled();
    });

    it('execute_emptyWatchlist_skipsFetching', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpChartService.fetchIntradayBars).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });

    it('execute_watchlistLoadFails_returnsWithoutWriting', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockRejectedValue(new Error('firestore down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpChartService.fetchIntradayBars).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });

    it('execute_intradayTodayBars_upsertsComputedSnapshot', async () => {
        // Arrange — previousClose from the EOD endpoint, price/series from the 1-min bars
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['AAA', 'Alpha Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([
            makeBar('2026-01-06 09:30:00', 102),
            makeBar('2026-01-06 09:31:00', 104)
        ]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenCalledWith('AAA', { from: '2026-01-02', to: TODAY });
        expect(mockFmpChartService.fetchIntradayBars).toHaveBeenCalledWith('AAA', { from: TODAY, to: TODAY });
        expect(mockFirestoreService.upsertPrice).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker: 'AAA',
                companyName: 'Alpha Inc.',
                price: 104,
                previousClose: 100,
                change: 4,
                changePercent: 4,
                sessionDate: TODAY,
                latestBarAt: '2026-01-06 09:31:00',
                closeFinalized: false
            })
        );
    });

    it('execute_noTodayBars_leavesDocumentUntouched', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['BBB', 'Beta Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });

    it('execute_previousCloseMissingInNarrowWindow_widensEodFetch', async () => {
        // Arrange — narrow EOD window has no record before today → widen
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['EEE', 'Echo Inc.']]));
        mockFmpEodService.fetchDailyCloses
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([eod('2025-12-31', 40)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([makeBar('2026-01-06 09:30:00', 50)]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenCalledTimes(2);
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenNthCalledWith(1, 'EEE', { from: '2026-01-02', to: TODAY });
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenNthCalledWith(2, 'EEE', { from: '2025-12-27', to: TODAY });
        expect(mockFirestoreService.upsertPrice).toHaveBeenCalledWith(
            expect.objectContaining({ ticker: 'EEE', previousClose: 40, change: 10 })
        );
    });

    it('execute_zeroPreviousClose_writesNullChange', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['ZZZ', 'Zeta Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 0)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([makeBar('2026-01-06 09:30:00', 50)]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.upsertPrice).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker: 'ZZZ',
                price: 50,
                previousClose: 0,
                change: null,
                changePercent: null
            })
        );
    });

    it('execute_eodFetchFails_writesPriceWithNullChange', async () => {
        // Arrange — a failed EOD fetch must not block the price/series write
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['HHH', 'Hotel Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockRejectedValue(new Error('eod down'));
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([makeBar('2026-01-06 09:30:00', 50)]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.upsertPrice).toHaveBeenCalledWith(
            expect.objectContaining({ ticker: 'HHH', price: 50, previousClose: null, change: null, changePercent: null })
        );
    });

    it('execute_intradayFmpFetchFails_doesNotWrite', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['CCC', 'Gamma Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);
        mockFmpChartService.fetchIntradayBars.mockRejectedValue(new Error('fmp down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });

    it('execute_upsertFails_completesWithoutThrowing', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['DDD', 'Delta Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([makeBar('2026-01-06 09:30:00', 104)]);
        mockFirestoreService.upsertPrice.mockRejectedValue(new Error('write failed'));

        // Act & Assert
        await expect(useCase.execute()).resolves.toBeUndefined();
        expect(mockFirestoreService.upsertPrice).toHaveBeenCalledTimes(1);
    });

    it('execute_maxCallsPerRunSet_processesOnlyCohortSlot', async () => {
        // Arrange
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            stock_prices: { ...baseCfg, maxCallsPerRun: 1 }
        });
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(
            new Map([['FFF', 'Foxtrot Inc.'], ['GGG', 'Golf Inc.']])
        );
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 8)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([makeBar('2026-01-06 09:30:00', 10)]);

        // Act
        await useCase.execute();

        // Assert — minute-of-day 600 % 2 cohorts === slot 0 → only the first sorted ticker
        expect(mockFmpChartService.fetchIntradayBars).toHaveBeenCalledTimes(1);
        expect(mockFmpChartService.fetchIntradayBars).toHaveBeenCalledWith('FFF', expect.anything());
        expect(mockFmpChartService.fetchIntradayBars).not.toHaveBeenCalledWith('GGG', expect.anything());
    });

    it('execute_preOpenSeed_warmsPreviousCloseWithoutWriting', async () => {
        // Arrange
        jest.setSystemTime(SEED_UTC);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['SEED', 'Seed Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);

        // Act
        await useCase.execute();

        // Assert — EOD seeded, no intraday fetch, no write
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenCalledWith('SEED', { from: '2026-01-02', to: TODAY });
        expect(mockFmpChartService.fetchIntradayBars).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });

    it('execute_finalize_overwritesPriceWithOfficialClose', async () => {
        // Arrange
        jest.setSystemTime(FINALIZE_UTC);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['FIN', 'Final Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100), eod('2026-01-06', 110)]);
        mockFmpChartService.fetchIntradayBars.mockResolvedValue([
            makeBar('2026-01-06 09:30:00', 102),
            makeBar('2026-01-06 15:59:00', 108)
        ]);

        // Act
        await useCase.execute();

        // Assert — price is the official close (110), not the 15:59 bar (108); series tip is the 16:00 point
        const snapshot = mockFirestoreService.upsertPrice.mock.calls[0]![0];
        expect(snapshot).toEqual(expect.objectContaining({
            ticker: 'FIN',
            price: 110,
            previousClose: 100,
            change: 10,
            changePercent: 10,
            latestBarAt: '2026-01-06 15:59:00',
            closeFinalized: true
        }));
        expect(snapshot.series[snapshot.series.length - 1]).toEqual({ t: '16:00', c: 110 });
    });

    it('execute_finalize_officialCloseNotPublished_doesNotWrite', async () => {
        // Arrange — EOD has no record dated today yet (the ~15-min delay)
        jest.setSystemTime(FINALIZE_UTC);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['NOFN', 'NoFinal Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2026-01-05', 100)]);

        // Act
        await useCase.execute();

        // Assert — guarded on the EOD record's date: no series fetch, no write
        expect(mockFmpChartService.fetchIntradayBars).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertPrice).not.toHaveBeenCalled();
    });
});
