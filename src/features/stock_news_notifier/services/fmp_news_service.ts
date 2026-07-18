import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { getRemoteConfig, StockNewsConfig } from '../../../core/remote-config';
import { FetchResult, StockNewsArticle } from '../models';
import { computeOverlapCutoff, formatEasternWallTime } from '../../../core/date_utils';

const _logger = new Logger('Stock News FMP Service');

const FMP_STOCK_NEWS_PATH = '/news/stock-latest';

const FMP_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
};

type FmpStockNewsDTO = Readonly<{
    symbol: string;
    publishedDate: string;
    url: string;
    publisher: string | null;
    title: string | null;
    image: string | null;
    site: string | null;
    text: string | null;
}>;

interface PaginationResult {
    articles: StockNewsArticle[];
    pagesFetched: number;
    reachedOverlap: boolean;
}

function isStringOrNullish(value: unknown): value is string | null | undefined {
    return value === null || value === undefined || typeof value === 'string';
}

function parseFmpStockNews(raw: unknown): FmpStockNewsDTO | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const r = raw as Record<string, unknown>;
    if (typeof r.symbol !== 'string' || !r.symbol.trim()) return null;
    if (typeof r.publishedDate !== 'string' || !r.publishedDate) return null;
    if (typeof r.url !== 'string' || !r.url) return null;
    if (
        !isStringOrNullish(r.publisher) ||
        !isStringOrNullish(r.title) ||
        !isStringOrNullish(r.image) ||
        !isStringOrNullish(r.site) ||
        !isStringOrNullish(r.text)
    ) {
        return null;
    }
    return {
        symbol: r.symbol,
        publishedDate: r.publishedDate,
        url: r.url,
        publisher: r.publisher ?? null,
        title: r.title ?? null,
        image: r.image ?? null,
        site: r.site ?? null,
        text: r.text ?? null,
    };
}

function mapArticles(rows: unknown[]): StockNewsArticle[] {
    const articles: StockNewsArticle[] = [];
    let dropped = 0;

    for (const row of rows) {
        const dto = parseFmpStockNews(row);
        if (!dto) {
            dropped++;
            continue;
        }
        articles.push({
            symbol: dto.symbol.trim().toUpperCase(),
            publishedDate: dto.publishedDate,
            publisher: dto.publisher ?? '',
            title: dto.title ?? '',
            image: dto.image ? dto.image : null,
            site: dto.site ?? '',
            text: dto.text ?? '',
            url: dto.url,
        });
    }

    if (dropped > 0) {
        _logger.info(`Dropped ${dropped} FMP news items missing or invalid symbol, url, or publishedDate.`);
    }
    return articles;
}

function oldestPublishedDate(articles: StockNewsArticle[]): string {
    return articles.reduce(
        (min, a) => (a.publishedDate < min ? a.publishedDate : min),
        articles[0]?.publishedDate ?? '',
    );
}

export class FmpNewsService {
    constructor(private apiKey: string) { }

    async fetchSinceWatermark(watermark: string, cfg: StockNewsConfig): Promise<FetchResult> {
        const overlapCutoff = computeOverlapCutoff(watermark, cfg.overlapWindowSeconds);
        const { articles, pagesFetched, reachedOverlap } = await this.paginateUntilCutoff(overlapCutoff, cfg);

        if (!reachedOverlap && cfg.maxBackfillPages > 0) {
            _logger.warn(
                `maxPages (${cfg.maxPages}) exhausted before reaching overlap cutoff ${overlapCutoff}. Falling back to ranged backfill.`,
            );
            const from = watermark.split(' ')[0] ?? watermark;
            const to = formatEasternWallTime(Date.now()).split(' ')[0] ?? '';
            articles.push(...await this.fetchRange(from, to, cfg));
        }

        const maxPublishedDate = articles.reduce(
            (max, a) => (a.publishedDate > max ? a.publishedDate : max),
            watermark,
        );

        _logger.info(`Fetched ${articles.length} articles over ${pagesFetched} page(s).`, {
            watermark,
            overlapCutoff,
            reachedOverlap,
            maxPublishedDate,
        });

        return { articles, pagesFetched, reachedOverlap, maxPublishedDate };
    }

    private async paginateUntilCutoff(overlapCutoff: string, cfg: StockNewsConfig): Promise<PaginationResult> {
        const articles: StockNewsArticle[] = [];
        let pagesFetched = 0;

        for (let page = 0; page < cfg.maxPages; page++) {
            const pageArticles = await this.fetchPage(page, cfg.pageLimit);
            pagesFetched++;
            articles.push(...pageArticles);

            if (pageArticles.length > 0 && oldestPublishedDate(pageArticles) < overlapCutoff) {
                return { articles, pagesFetched, reachedOverlap: true };
            }
            if (pageArticles.length < cfg.pageLimit) {
                return { articles, pagesFetched, reachedOverlap: true };
            }
        }

        return { articles, pagesFetched, reachedOverlap: false };
    }

    async fetchRange(from: string, to: string, cfg: StockNewsConfig): Promise<StockNewsArticle[]> {
        const articles: StockNewsArticle[] = [];

        for (let page = 0; page < cfg.maxBackfillPages; page++) {
            const pageArticles = await this.fetchPage(page, cfg.pageLimit, from, to);
            articles.push(...pageArticles);

            if (pageArticles.length < cfg.pageLimit) {
                return articles;
            }
        }

        _logger.error(
            `Ranged backfill hit maxBackfillPages (${cfg.maxBackfillPages}) without exhausting the feed — coverage gap possible.`,
            { from, to },
        );
        return articles;
    }

    private fetchPage(page: number, limit: number, from?: string, to?: string): Promise<StockNewsArticle[]> {
        return retry(async () => {
            const config = await getRemoteConfig();
            const baseUrl = config.fmp.baseUrl;
            const rangeParams = from && to ? `&from=${from}&to=${to}` : '';
            const url = `${baseUrl}${FMP_STOCK_NEWS_PATH}?page=${page}&limit=${limit}${rangeParams}&apikey=${this.apiKey}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
            }

            const data: unknown = await response.json();
            if (!Array.isArray(data)) {
                throw new Error(`FMP API returned a non-array response for page ${page}`);
            }

            return mapArticles(data);
        }, FMP_RETRY_OPTIONS);
    }
}
