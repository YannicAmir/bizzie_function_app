import { YtdPriceSyncUseCase } from '../../../features/ytd_price_sync/usecase';
import { FmpEodService } from '../../../features/ytd_price_sync/services/fmp_eod_service';
import { FirestoreService } from '../../../features/ytd_price_sync/services/firestore_service';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { getRemoteConfig, YtdPriceChangeConfig } from '../../../core/remote-config';
import { EodClose } from '../../../features/ytd_price_sync/models/EodClose';

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

const baseCfg: YtdPriceChangeConfig = {
    fetchConcurrency: 4,
    watchlistCacheSeconds: 300,
    baselineLookbackCalendarDays: 15
};

const NOW_UTC = new Date('2026-07-15T15:00:00Z');
const TODAY = '2026-07-15';
const WINDOW = { from: '2025-12-17', to: TODAY };

const eod = (date: string, close: number): EodClose => ({ date, close });

describe('YtdPriceSyncUseCase', () => {
    let useCase: YtdPriceSyncUseCase;
    let mockFmpEodService: jest.Mocked<FmpEodService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;
    let mockWatchlistService: jest.Mocked<WatchlistService>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        jest.useFakeTimers().setSystemTime(NOW_UTC);
        (getRemoteConfig as jest.Mock).mockResolvedValue({ ytd_price_change: baseCfg });
        mockFmpEodService = {
            fetchDailyCloses: jest.fn()
        } as unknown as jest.Mocked<FmpEodService>;
        mockFirestoreService = {
            upsertYtd: jest.fn().mockResolvedValue(undefined)
        } as unknown as jest.Mocked<FirestoreService>;
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        } as jest.Mocked<WatchlistService>;
        useCase = new YtdPriceSyncUseCase(
            mockFmpEodService,
            mockFirestoreService,
            mockWatchlistService
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('execute_validWatchlist_fetchesWindowAndUpsertsSnapshot', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['AAA', 'Alpha Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2025-12-31', 100), eod(TODAY, 130)]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenCalledWith('AAA', WINDOW);
        expect(mockFirestoreService.upsertYtd).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker: 'AAA',
                companyName: 'Alpha Inc.',
                year: 2026,
                baselineClose: 100,
                latestClose: 130,
                ytdChange: 30,
                ytdChangePercent: 30
            })
        );
    });

    it('execute_watchlistLoadFails_returnsWithoutFetching', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockRejectedValue(new Error('firestore down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertYtd).not.toHaveBeenCalled();
    });

    it('execute_emptyWatchlist_skipsFetching', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).not.toHaveBeenCalled();
        expect(mockFirestoreService.upsertYtd).not.toHaveBeenCalled();
    });

    it('execute_noBaseline_leavesDocumentUntouched', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['BBB', 'Beta Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.upsertYtd).not.toHaveBeenCalled();
    });

    it('execute_fetchThrows_completesWithoutThrowing', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['CCC', 'Gamma Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockRejectedValue(new Error('fmp down'));

        // Act & Assert
        await expect(useCase.execute()).resolves.toBeUndefined();
        expect(mockFirestoreService.upsertYtd).not.toHaveBeenCalled();
    });

    it('execute_upsertThrows_completesWithoutThrowing', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['DDD', 'Delta Inc.']]));
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2025-12-31', 100), eod(TODAY, 130)]);
        mockFirestoreService.upsertYtd.mockRejectedValue(new Error('write failed'));

        // Act & Assert
        await expect(useCase.execute()).resolves.toBeUndefined();
        expect(mockFirestoreService.upsertYtd).toHaveBeenCalledTimes(1);
    });

    it('execute_multipleTickers_processesEach', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(
            new Map([['AAA', 'Alpha Inc.'], ['BBB', 'Beta Inc.']])
        );
        mockFmpEodService.fetchDailyCloses.mockResolvedValue([eod('2025-12-31', 100), eod(TODAY, 130)]);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpEodService.fetchDailyCloses).toHaveBeenCalledTimes(2);
        expect(mockFirestoreService.upsertYtd).toHaveBeenCalledTimes(2);
    });
});
