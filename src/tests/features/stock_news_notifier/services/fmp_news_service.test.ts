import { FmpNewsService } from '../../../../features/stock_news_notifier/services/fmp_news_service';
import { getRemoteConfig, StockNewsConfig } from '../../../../core/remote-config';
import { retry } from '../../../../core/retry';

jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn()
}));
jest.mock('../../../../core/retry', () => ({
    retry: jest.fn()
}));
jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

global.fetch = jest.fn();

const WATERMARK = '2026-01-05 12:00:00';

const baseCfg: StockNewsConfig = {
    pageLimit: 2,
    maxPages: 3,
    maxBackfillPages: 2,
    overlapWindowSeconds: 300,
    notificationCooldownSeconds: 600,
    watchlistCacheSeconds: 3600
};

interface DtoOverrides {
    symbol?: string | null;
    publishedDate?: string | null;
    publisher?: string | null;
    title?: string | null;
    image?: string | null;
    site?: string | null;
    text?: string | null;
    url?: string | null;
}

const makeDto = (overrides: DtoOverrides = {}) => ({
    symbol: 'AAPL',
    publishedDate: '2026-01-05 12:10:00',
    publisher: 'Reuters',
    title: 'A headline',
    image: 'https://img.example.com/1.png',
    site: 'reuters.com',
    text: 'Some text',
    url: 'https://news.example.com/1',
    ...overrides
});

const mockPage = (items: unknown[]) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => items
    });
};

describe('FmpNewsService', () => {
    let service: FmpNewsService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (retry as jest.Mock).mockImplementation(async (fn) => fn());
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com' }
        });
        service = new FmpNewsService('test-key');
    });

    it('fetchSinceWatermark_oldestBeforeCutoff_stopsAfterFirstPage', async () => {
        // Arrange
        mockPage([
            makeDto({ publishedDate: '2026-01-05 12:10:00' }),
            makeDto({ publishedDate: '2026-01-05 11:50:00', url: 'https://news.example.com/2' })
        ]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, baseCfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('https://api.test.com/news/stock-latest?page=0&limit=2')
        );
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('apikey=test-key'));
        expect(result.reachedOverlap).toBe(true);
        expect(result.pagesFetched).toBe(1);
        expect(result.maxPublishedDate).toBe('2026-01-05 12:10:00');
        expect(result.articles).toHaveLength(2);
    });

    it('fetchSinceWatermark_shortPage_stopsWithoutBackfill', async () => {
        // Arrange
        mockPage([makeDto({ publishedDate: '2026-01-05 12:05:00' })]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, baseCfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(result.reachedOverlap).toBe(true);
        expect(result.articles).toHaveLength(1);
    });

    it('fetchSinceWatermark_maxPagesExhausted_fallsBackToRangedBackfill', async () => {
        // Arrange
        const cfg: StockNewsConfig = { ...baseCfg, maxPages: 1 };
        mockPage([
            makeDto({ publishedDate: '2026-01-05 12:10:00' }),
            makeDto({ publishedDate: '2026-01-05 12:05:00', url: 'https://news.example.com/2' })
        ]);
        mockPage([makeDto({ publishedDate: '2026-01-05 11:58:00', url: 'https://news.example.com/3' })]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, cfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect((global.fetch as jest.Mock).mock.calls[1]![0]).toContain('from=2026-01-05');
        expect(result.reachedOverlap).toBe(false);
        expect(result.articles).toHaveLength(3);
    });

    it('fetchSinceWatermark_maxPagesExhaustedWithBackfillDisabled_returnsPagesOnly', async () => {
        // Arrange
        const cfg: StockNewsConfig = { ...baseCfg, maxPages: 1, maxBackfillPages: 0 };
        mockPage([
            makeDto({ publishedDate: '2026-01-05 12:10:00' }),
            makeDto({ publishedDate: '2026-01-05 12:05:00', url: 'https://news.example.com/2' })
        ]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, cfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(result.reachedOverlap).toBe(false);
        expect(result.articles).toHaveLength(2);
    });

    it('fetchSinceWatermark_emptyFeed_returnsWatermarkAsMaxPublishedDate', async () => {
        // Arrange
        mockPage([]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, baseCfg);

        // Assert
        expect(result.articles).toHaveLength(0);
        expect(result.reachedOverlap).toBe(true);
        expect(result.maxPublishedDate).toBe(WATERMARK);
    });

    it('fetchSinceWatermark_invalidItems_dropsAndNormalizesRest', async () => {
        // Arrange
        mockPage([
            makeDto({ symbol: ' aapl ', publisher: null, title: null, image: null, site: null, text: null }),
            makeDto({ url: null }),
            makeDto({ publishedDate: null })
        ]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, { ...baseCfg, pageLimit: 4 });

        // Assert
        expect(result.articles).toHaveLength(1);
        expect(result.articles[0]).toEqual({
            symbol: 'AAPL',
            publishedDate: '2026-01-05 12:10:00',
            publisher: '',
            title: '',
            image: null,
            site: '',
            text: '',
            url: 'https://news.example.com/1'
        });
    });

    it('fetchSinceWatermark_httpError_propagatesError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        // Act & Assert
        await expect(service.fetchSinceWatermark(WATERMARK, baseCfg)).rejects.toThrow(
            'FMP API Error: 500 Internal Server Error'
        );
    });

    it('fetchSinceWatermark_nonArrayResponse_propagatesError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ error: 'rate limited' })
        });

        // Act & Assert
        await expect(service.fetchSinceWatermark(WATERMARK, baseCfg)).rejects.toThrow(
            'FMP API returned a non-array response for page 0'
        );
    });

    it('fetchSinceWatermark_malformedItemShapes_dropsWithoutThrowing', async () => {
        // Arrange
        mockPage([
            makeDto({ symbol: 12345 as unknown as string }),
            makeDto({ title: { nested: true } as unknown as string, url: 'https://news.example.com/2' }),
            'not-an-object',
            makeDto({ url: 'https://news.example.com/3' })
        ]);

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, { ...baseCfg, pageLimit: 5 });

        // Assert
        expect(result.articles).toHaveLength(1);
        expect(result.articles[0]?.url).toBe('https://news.example.com/3');
    });

    it('fetchRange_shortPage_stopsEarly', async () => {
        // Arrange
        mockPage([makeDto()]);

        // Act
        const result = await service.fetchRange('2026-01-05', '2026-01-06', baseCfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect((global.fetch as jest.Mock).mock.calls[0]![0]).toContain('from=2026-01-05&to=2026-01-06');
        expect(result).toHaveLength(1);
    });

    it('fetchRange_maxBackfillPagesExhausted_returnsCollectedArticles', async () => {
        // Arrange
        mockPage([
            makeDto(),
            makeDto({ url: 'https://news.example.com/2' })
        ]);
        mockPage([
            makeDto({ url: 'https://news.example.com/3' }),
            makeDto({ url: 'https://news.example.com/4' })
        ]);

        // Act
        const result = await service.fetchRange('2026-01-05', '2026-01-06', baseCfg);

        // Assert
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(4);
    });
});
