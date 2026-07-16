import { StockNewsNotifierUseCase } from '../../../features/stock_news_notifier/usecase';
import { FmpNewsService } from '../../../features/stock_news_notifier/services/fmp_news_service';
import { computeNewsId, FirestoreService } from '../../../features/stock_news_notifier/services/firestore_service';
import { FcmService } from '../../../features/stock_news_notifier/services/fcm_service';
import { FetchResult, StockNewsArticle } from '../../../features/stock_news_notifier/models';
import { WatchlistService } from '../../../core/services/watchlist_service';
import { getRemoteConfig, StockNewsConfig } from '../../../core/remote-config';

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

const CURSOR = '2026-01-05 06:00:00';

const baseCfg: StockNewsConfig = {
    pageLimit: 20,
    maxPages: 3,
    maxBackfillPages: 2,
    overlapWindowSeconds: 300,
    notificationCooldownSeconds: 600,
    watchlistCacheSeconds: 3600
};

const makeArticle = (overrides: Partial<StockNewsArticle> = {}): StockNewsArticle => ({
    symbol: 'AAPL',
    publishedDate: '2026-01-05 06:30:00',
    publisher: 'Reuters',
    title: 'Apple announces a new product line',
    image: null,
    site: 'reuters.com',
    text: 'Some article text',
    url: 'https://news.example.com/apple-1',
    ...overrides
});

const makeFetchResult = (articles: StockNewsArticle[]): FetchResult => ({
    articles,
    pagesFetched: 1,
    reachedOverlap: true,
    maxPublishedDate: articles.reduce(
        (max, a) => (a.publishedDate > max ? a.publishedDate : max),
        CURSOR
    )
});

describe('StockNewsNotifierUseCase', () => {
    let useCase: StockNewsNotifierUseCase;
    let mockFmpNewsService: jest.Mocked<FmpNewsService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;
    let mockFcmService: jest.Mocked<FcmService>;
    let mockWatchlistService: jest.Mocked<WatchlistService>;
    let nowMs = Date.UTC(2026, 0, 5, 17, 0, 0);

    beforeEach(() => {
        // Arrange
        nowMs += 24 * 60 * 60 * 1000;
        jest.useFakeTimers().setSystemTime(nowMs);

        (getRemoteConfig as jest.Mock).mockResolvedValue({ stock_news: baseCfg });

        mockFmpNewsService = {
            fetchSinceWatermark: jest.fn(),
            fetchRange: jest.fn()
        } as unknown as jest.Mocked<FmpNewsService>;
        mockFirestoreService = {
            acquireLease: jest.fn(),
            releaseLease: jest.fn(),
            getCursor: jest.fn(),
            advanceCursor: jest.fn(),
            createNewsIfAbsent: jest.fn(),
            claimNotificationSlot: jest.fn()
        } as unknown as jest.Mocked<FirestoreService>;
        mockFcmService = {
            sendNewsNotification: jest.fn()
        } as unknown as jest.Mocked<FcmService>;
        mockWatchlistService = {
            getAllWatchedTickers: jest.fn()
        };

        mockFirestoreService.acquireLease.mockResolvedValue(true);
        mockFirestoreService.releaseLease.mockResolvedValue(undefined);
        mockFirestoreService.getCursor.mockResolvedValue(CURSOR);
        mockFirestoreService.advanceCursor.mockResolvedValue(undefined);
        mockFirestoreService.createNewsIfAbsent.mockResolvedValue(true);
        mockFirestoreService.claimNotificationSlot.mockResolvedValue(true);
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map([['AAPL', 'Apple Inc.']]));
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([]));
        mockFcmService.sendNewsNotification.mockResolvedValue(undefined);

        useCase = new StockNewsNotifierUseCase(
            mockFmpNewsService,
            mockFirestoreService,
            mockFcmService,
            mockWatchlistService
        );
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('execute_leaseHeldElsewhere_exitsWithoutFetching', async () => {
        // Arrange
        mockFirestoreService.acquireLease.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).not.toHaveBeenCalled();
    });

    it('execute_acquireLeaseThrows_exitsGracefully', async () => {
        // Arrange
        mockFirestoreService.acquireLease.mockRejectedValue(new Error('txn failed'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.getCursor).not.toHaveBeenCalled();
        expect(mockFmpNewsService.fetchSinceWatermark).not.toHaveBeenCalled();
    });

    it('execute_emptyWatchlist_exitsAndReleasesLease', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(new Map());

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_watchlistLookupFails_releasesLeaseAndRethrows', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockRejectedValue(new Error('watchlist down'));

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow('watchlist down');
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_newWatchedArticle_storesAndNotifies', async () => {
        // Arrange
        const article = makeArticle();
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).toHaveBeenCalledWith(CURSOR, baseCfg);
        expect(mockFirestoreService.createNewsIfAbsent).toHaveBeenCalledWith(article);
        expect(mockFirestoreService.claimNotificationSlot).toHaveBeenCalledWith('AAPL', 600);
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledWith({
            ticker: 'AAPL',
            title: 'AAPL News',
            body: article.title,
            newsId: computeNewsId('AAPL', article.url),
            url: article.url,
            count: 1
        });
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 06:30:00');
    });

    it('execute_firstRun_bootstrapsWatermarkAndFetchesSinglePage', async () => {
        // Arrange
        mockFirestoreService.getCursor.mockResolvedValue(null);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFmpNewsService.fetchSinceWatermark).toHaveBeenCalledWith(
            expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
            expect.objectContaining({ maxPages: 1, maxBackfillPages: 0 })
        );
    });

    it('execute_fetchFails_skipsCursorAdvanceAndReleasesLease', async () => {
        // Arrange
        mockFmpNewsService.fetchSinceWatermark.mockRejectedValue(new Error('fmp down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_unwatchedSymbol_skipsStorageAndAdvancesCursor', async () => {
        // Arrange
        const article = makeArticle({ symbol: 'TSLA' });
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).not.toHaveBeenCalled();
        expect(mockFcmService.sendNewsNotification).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 06:30:00');
    });

    it('execute_articleOlderThanOverlapCutoff_skipsStorage', async () => {
        // Arrange
        const article = makeArticle({ publishedDate: '2026-01-05 05:00:00' });
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).not.toHaveBeenCalled();
        expect(mockFcmService.sendNewsNotification).not.toHaveBeenCalled();
    });

    it('execute_duplicateArticle_skipsNotificationAndAdvancesCursor', async () => {
        // Arrange
        const article = makeArticle();
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));
        mockFirestoreService.createNewsIfAbsent.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.claimNotificationSlot).not.toHaveBeenCalled();
        expect(mockFcmService.sendNewsNotification).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 06:30:00');
    });

    it('execute_articleWriteFails_skipsCursorAdvanceAndNotification', async () => {
        // Arrange
        const article = makeArticle();
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));
        mockFirestoreService.createNewsIfAbsent.mockRejectedValue(new Error('write failed'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFcmService.sendNewsNotification).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).not.toHaveBeenCalled();
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_cooldownActive_storesWithoutNotifying', async () => {
        // Arrange
        const article = makeArticle();
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));
        mockFirestoreService.claimNotificationSlot.mockResolvedValue(false);

        // Act
        await useCase.execute();

        // Assert
        expect(mockFirestoreService.createNewsIfAbsent).toHaveBeenCalledWith(article);
        expect(mockFcmService.sendNewsNotification).not.toHaveBeenCalled();
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 06:30:00');
    });

    it('execute_multipleNewArticles_coalescesIntoOneNotification', async () => {
        // Arrange
        const older = makeArticle({
            title: 'Older story',
            publishedDate: '2026-01-05 06:10:00',
            url: 'https://news.example.com/apple-1'
        });
        const newest = makeArticle({
            title: 'Newest story',
            publishedDate: '2026-01-05 07:00:00',
            url: 'https://news.example.com/apple-2'
        });
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([older, newest]));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledTimes(1);
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledWith({
            ticker: 'AAPL',
            title: 'AAPL: 2 new stories',
            body: 'Newest story... and more',
            newsId: computeNewsId('AAPL', newest.url),
            url: newest.url,
            count: 2
        });
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 07:00:00');
    });

    it('execute_longTitle_truncatesNotificationBody', async () => {
        // Arrange
        const article = makeArticle({ title: 'X'.repeat(200) });
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledWith(
            expect.objectContaining({ body: 'X'.repeat(178) })
        );
    });

    it('execute_advanceCursorThrows_stillReleasesLease', async () => {
        // Arrange
        const article = makeArticle();
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(makeFetchResult([article]));
        mockFirestoreService.advanceCursor.mockRejectedValue(new Error('cursor txn failed'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledTimes(1);
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });

    it('execute_watchlistLookup_passesCacheTtlFromConfig', async () => {
        // Act
        await useCase.execute();

        // Assert
        expect(mockWatchlistService.getAllWatchedTickers).toHaveBeenCalledWith(
            baseCfg.watchlistCacheSeconds
        );
    });

    it('execute_fcmSendFailsForOneTicker_stillNotifiesOthersAndAdvancesCursor', async () => {
        // Arrange
        mockWatchlistService.getAllWatchedTickers.mockResolvedValue(
            new Map([['AAPL', 'Apple Inc.'], ['TSLA', 'Tesla Inc.']])
        );
        const appleArticle = makeArticle();
        const teslaArticle = makeArticle({
            symbol: 'TSLA',
            publishedDate: '2026-01-05 06:45:00',
            url: 'https://news.example.com/tesla-1'
        });
        mockFmpNewsService.fetchSinceWatermark.mockResolvedValue(
            makeFetchResult([appleArticle, teslaArticle])
        );
        mockFcmService.sendNewsNotification.mockRejectedValueOnce(new Error('fcm down'));

        // Act
        await useCase.execute();

        // Assert
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledTimes(2);
        expect(mockFcmService.sendNewsNotification).toHaveBeenCalledWith(
            expect.objectContaining({ ticker: 'TSLA' })
        );
        expect(mockFirestoreService.advanceCursor).toHaveBeenCalledWith('2026-01-05 06:45:00');
        expect(mockFirestoreService.releaseLease).toHaveBeenCalledTimes(1);
    });
});
