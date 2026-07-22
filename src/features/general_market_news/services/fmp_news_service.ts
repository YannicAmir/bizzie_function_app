import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { getRemoteConfig, GeneralMarketNewsConfig } from '../../../core/remote-config';
import { FetchResult, GeneralNewsArticle } from '../models';
import { computeOverlapCutoff, dateOf, todayEasternDate } from '../../../core/date_utils';

const _logger = new Logger('General Market News FMP Service');

const FMP_GENERAL_NEWS_PATH = '/news/general-latest';

const FMP_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
};

type FmpGeneralNewsDTO = Readonly<{
    publishedDate: string;
    url: string;
    publisher: string | null;
    title: string | null;
    image: string | null;
    site: string | null;
    text: string | null;
}>;

interface PaginationResult {
    articles: GeneralNewsArticle[];
    pagesFetched: number;
    reachedOverlap: boolean;
}

interface PageRequest {
    baseUrl: string;
    page: number;
    limit: number;
    from?: string;
    to?: string;
}

function isStringOrNullish(value: unknown): value is string | null | undefined {
    return value === null || value === undefined || typeof value === 'string';
}

function parseFmpGeneralNews(raw: unknown): FmpGeneralNewsDTO | null {
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const r = raw as Record<string, unknown>;
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
        publishedDate: r.publishedDate,
        url: r.url,
        publisher: r.publisher ?? null,
        title: r.title ?? null,
        image: r.image ?? null,
        site: r.site ?? null,
        text: r.text ?? null,
    };
}

function mapArticles(rows: unknown[]): GeneralNewsArticle[] {
    const articles: GeneralNewsArticle[] = [];
    let dropped = 0;

    for (const row of rows) {
        const dto = parseFmpGeneralNews(row);
        if (!dto) {
            dropped++;
            continue;
        }
        articles.push({
            publishedDate: dto.publishedDate,
            publisher: dto.publisher ?? '',
            title: dto.title ?? '',
            image: dto.image ?? null,
            site: dto.site ?? '',
            text: dto.text ?? '',
            url: dto.url,
        });
    }

    if (dropped > 0) {
        _logger.info(`Dropped ${dropped} FMP news items missing or invalid url or publishedDate.`);
    }
    return articles;
}

function oldestPublishedDate(articles: GeneralNewsArticle[]): string {
    return articles.reduce(
        (min, a) => (a.publishedDate < min ? a.publishedDate : min),
        articles[0]?.publishedDate ?? '',
    );
}

export class FmpNewsService {
    constructor(private apiKey: string) { }

    async fetchSinceWatermark(watermark: string, cfg: GeneralMarketNewsConfig): Promise<FetchResult> {
        const overlapCutoff = computeOverlapCutoff(watermark, cfg.overlapWindowSeconds);
        const { articles, pagesFetched, reachedOverlap } = await this.paginateUntilCutoff(overlapCutoff, cfg);

        if (!reachedOverlap) {
            _logger.warn(
                `maxPages (${cfg.maxPages}) exhausted before reaching overlap cutoff ${overlapCutoff}.`,
                { watermark },
            );
            if (cfg.maxBackfillPages > 0) {
                const from = dateOf(watermark);
                const to = todayEasternDate(Date.now());
                articles.push(...await this.fetchRange(from, to, cfg));
            }
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

    private async paginateUntilCutoff(overlapCutoff: string, cfg: GeneralMarketNewsConfig): Promise<PaginationResult> {
        const baseUrl = await this.resolveBaseUrl();
        const articles: GeneralNewsArticle[] = [];
        let pagesFetched = 0;

        for (let page = 0; page < cfg.maxPages; page++) {
            const pageArticles = await this.fetchPage({ baseUrl, page, limit: cfg.pageLimit });
            pagesFetched++;
            articles.push(...pageArticles);

            // publishedDate is a fixed-width sortable wall-time string, so lexical `<` compares chronologically.
            if (pageArticles.length > 0 && oldestPublishedDate(pageArticles) < overlapCutoff) {
                return { articles, pagesFetched, reachedOverlap: true };
            }
            if (pageArticles.length < cfg.pageLimit) {
                return { articles, pagesFetched, reachedOverlap: true };
            }
        }

        return { articles, pagesFetched, reachedOverlap: false };
    }

    async fetchRange(from: string, to: string, cfg: GeneralMarketNewsConfig): Promise<GeneralNewsArticle[]> {
        const baseUrl = await this.resolveBaseUrl();
        const articles: GeneralNewsArticle[] = [];

        for (let page = 0; page < cfg.maxBackfillPages; page++) {
            const pageArticles = await this.fetchPage({ baseUrl, page, limit: cfg.pageLimit, from, to });
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

    private async resolveBaseUrl(): Promise<string> {
        const config = await getRemoteConfig();
        return config.fmp.baseUrl;
    }

    private fetchPage(request: PageRequest): Promise<GeneralNewsArticle[]> {
        return retry(async () => {
            const params = new URLSearchParams({
                page: String(request.page),
                limit: String(request.limit),
                apikey: this.apiKey,
            });
            if (request.from && request.to) {
                params.set('from', request.from);
                params.set('to', request.to);
            }
            const url = `${request.baseUrl}${FMP_GENERAL_NEWS_PATH}?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
            }

            const data: unknown = await response.json();
            if (!Array.isArray(data)) {
                throw new Error(`FMP API returned a non-array response for page ${request.page}`);
            }

            return mapArticles(data);
        }, FMP_RETRY_OPTIONS);
    }
}
