import { FmpNewsService } from '../../../../features/general_market_news/services/fmp_news_service';
import { getRemoteConfig, GeneralMarketNewsConfig } from '../../../../core/remote-config';

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));
jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn()
}));
jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn: () => Promise<unknown>) => fn())
}));

const BASE_URL = 'https://fmp.test/stable';
const API_KEY = 'test-key';
const WATERMARK = '2026-01-05 12:00:00';

function newsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        publishedDate: '2026-01-05 12:30:00',
        url: 'https://news.example.com/1',
        publisher: 'Reuters',
        title: 'A headline',
        image: null,
        site: 'reuters.com',
        text: 'Some text',
        ...overrides
    };
}

function okResponse(rows: unknown): { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> } {
    return { ok: true, status: 200, statusText: 'OK', json: async () => rows };
}

describe('FmpNewsService', () => {
    let service: FmpNewsService;
    let mockFetch: jest.Mock;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockFetch = jest.fn();
        global.fetch = mockFetch as unknown as typeof fetch;
        (getRemoteConfig as jest.Mock).mockResolvedValue({ fmp: { baseUrl: BASE_URL } });
        service = new FmpNewsService(API_KEY);
    });

    it('fetchSinceWatermark_overlapReachedOnFirstPage_returnsArticlesWithoutBackfill', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 4,
            maxBackfillPages: 10,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ publishedDate: '2026-01-05 12:30:00', url: 'https://news.example.com/1' }),
            newsRow({ publishedDate: '2026-01-05 11:00:00', url: 'https://news.example.com/2' })
        ]));

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, cfg);

        // Assert
        expect(result.reachedOverlap).toBe(true);
        expect(result.articles).toHaveLength(2);
        expect(result.maxPublishedDate).toBe('2026-01-05 12:30:00');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetchSinceWatermark_maxPagesExhausted_triggersRangedBackfill', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 1,
            maxBackfillPages: 1,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ publishedDate: '2026-01-05 12:30:00', url: 'https://news.example.com/1' }),
            newsRow({ publishedDate: '2026-01-05 12:40:00', url: 'https://news.example.com/2' })
        ]));
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ publishedDate: '2026-01-05 12:50:00', url: 'https://news.example.com/3' })
        ]));

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, cfg);

        // Assert
        expect(result.reachedOverlap).toBe(false);
        expect(result.articles).toHaveLength(3);
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[1][0]).toContain('from=2026-01-05');
    });

    it('fetchSinceWatermark_invalidRowsInPage_dropsInvalidArticles', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 1,
            maxBackfillPages: 0,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ url: 'https://news.example.com/1' }),
            newsRow({ url: undefined })
        ]));

        // Act
        const result = await service.fetchSinceWatermark(WATERMARK, cfg);

        // Assert
        expect(result.articles).toHaveLength(1);
        expect(result.articles[0]?.url).toBe('https://news.example.com/1');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetchSinceWatermark_nonOkResponse_rejects', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 1,
            maxBackfillPages: 0,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            json: async () => []
        });

        // Act & Assert
        await expect(service.fetchSinceWatermark(WATERMARK, cfg)).rejects.toThrow('FMP API Error: 500 Server Error');
    });

    it('fetchSinceWatermark_nonArrayResponse_rejects', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 1,
            maxBackfillPages: 0,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse({ error: 'not an array' }));

        // Act & Assert
        await expect(service.fetchSinceWatermark(WATERMARK, cfg)).rejects.toThrow('non-array response');
    });

    it('fetchRange_pageBelowLimit_stopsAndReturnsArticles', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 2,
            maxPages: 4,
            maxBackfillPages: 3,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ url: 'https://news.example.com/1' })
        ]));

        // Act
        const result = await service.fetchRange('2026-01-04', '2026-01-05', cfg);

        // Assert
        expect(result).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0][0]).toContain('from=2026-01-04&to=2026-01-05');
    });

    it('fetchRange_maxBackfillPagesExhausted_returnsAllFetchedArticles', async () => {
        // Arrange
        const cfg: GeneralMarketNewsConfig = {
            pageLimit: 1,
            maxPages: 4,
            maxBackfillPages: 2,
            overlapWindowSeconds: 600,
            runIntervalSeconds: 300
        };
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ url: 'https://news.example.com/1' })
        ]));
        mockFetch.mockResolvedValueOnce(okResponse([
            newsRow({ url: 'https://news.example.com/2' })
        ]));

        // Act
        const result = await service.fetchRange('2026-01-04', '2026-01-05', cfg);

        // Assert
        expect(result).toHaveLength(2);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
