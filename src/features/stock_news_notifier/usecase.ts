import { Logger } from '../../core/logger';
import { retry } from '../../core/retry';
import { getRemoteConfig, StockNewsConfig } from '../../core/remote-config';
import { WatchlistService } from '../../core/services/watchlist_service';
import { MULTI_ARTICLE_BODY_SUFFIX, NOTIFICATION_BODY_MAX_CHARS } from './constants';
import { NewsNotificationInput, StockNewsArticle } from './models';
import { FcmService } from './services/fcm_service';
import { computeOverlapCutoff, formatEasternWallTime } from '../../core/date_utils';
import { computeNewsId, FirestoreService } from './services/firestore_service';
import { FmpNewsService } from './services/fmp_news_service';

const _logger = new Logger('Stock News Notifier Usecase');

const WATCHLIST_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
};

interface StoreResult {
    createdByTicker: Map<string, StockNewsArticle[]>;
    anyWriteFailed: boolean;
}

export class StockNewsNotifierUseCase {

    constructor(
        private fmpNewsService: FmpNewsService,
        private firestoreService: FirestoreService,
        private fcmService: FcmService,
        private watchlistService: WatchlistService,
    ) { }

    async execute(): Promise<void> {
        const leaseAcquired = await this.tryAcquireLease();
        if (!leaseAcquired) {
            return;
        }

        try {
            await this.runPipeline();
        } finally {
            await this.firestoreService.releaseLease();
        }
    }

    private async tryAcquireLease(): Promise<boolean> {
        let leaseAcquired: boolean;
        try {
            leaseAcquired = await this.firestoreService.acquireLease();
        } catch (error) {
            _logger.error('Failed to acquire lease transaction — next minute retries.', error);
            return false;
        }
        if (!leaseAcquired) {
            _logger.info('Another invocation holds the lease. Exiting.');
        }
        return leaseAcquired;
    }

    private async runPipeline(): Promise<void> {
        const cfg = (await getRemoteConfig()).stock_news;

        const watchlist = await retry(
            () => this.watchlistService.getAllWatchedTickers(cfg.watchlistCacheSeconds),
            WATCHLIST_RETRY_OPTIONS,
        );
        if (watchlist.size === 0) {
            _logger.info('No tickers watched. Exiting.');
            return;
        }

        const { watermark, firstRun } = await this.resolveWatermark(cfg);
        const fetchCfg: StockNewsConfig = firstRun
            ? { ...cfg, maxPages: 1, maxBackfillPages: 0 }
            : cfg;
        const fetchResult = await this.fetchSinceWatermark(watermark, fetchCfg);
        if (fetchResult === null) {
            return;
        }

        const eligible = this.filterEligibleArticles(fetchResult.articles, watermark, cfg, watchlist);
        const { createdByTicker, anyWriteFailed } = await this.storeArticles(eligible);

        _logger.info(
            `Matched ${eligible.length} watchlisted article(s); freshly created for ${createdByTicker.size} ticker(s).`,
            { fetched: fetchResult.articles.length, eligible: eligible.length },
        );

        await this.notifyTickers(createdByTicker, cfg);

        if (anyWriteFailed) {
            _logger.error('One or more article writes failed — skipping cursor advance; next run re-fetches.');
            return;
        }
        await this.advanceCursor(fetchResult.maxPublishedDate);
    }

    private async resolveWatermark(
        cfg: StockNewsConfig,
    ): Promise<{ watermark: string; firstRun: boolean }> {
        const cursor = await this.firestoreService.getCursor();
        if (cursor !== null) {
            return { watermark: cursor, firstRun: false };
        }
        const watermark = formatEasternWallTime(Date.now() - cfg.overlapWindowSeconds * 1000);
        _logger.info(`First run — bootstrapped watermark to ${watermark}; fetching page 0 only.`);
        return { watermark, firstRun: true };
    }

    private async fetchSinceWatermark(
        watermark: string,
        fetchCfg: StockNewsConfig,
    ): Promise<{ articles: StockNewsArticle[]; maxPublishedDate: string } | null> {
        try {
            return await this.fmpNewsService.fetchSinceWatermark(watermark, fetchCfg);
        } catch (error) {
            _logger.error('FMP fetch failed after retries — cursor not advanced; next run re-covers the window.', error);
            return null;
        }
    }

    private filterEligibleArticles(
        articles: StockNewsArticle[],
        watermark: string,
        cfg: StockNewsConfig,
        watchlist: Map<string, string>,
    ): StockNewsArticle[] {
        const overlapCutoff = computeOverlapCutoff(watermark, cfg.overlapWindowSeconds);
        return articles.filter(
            (a) => a.publishedDate >= overlapCutoff && watchlist.has(a.symbol),
        );
    }

    private async storeArticles(eligible: StockNewsArticle[]): Promise<StoreResult> {
        const byTicker = new Map<string, StockNewsArticle[]>();
        for (const article of eligible) {
            const group = byTicker.get(article.symbol);
            if (group) {
                group.push(article);
            } else {
                byTicker.set(article.symbol, [article]);
            }
        }

        const createdByTicker = new Map<string, StockNewsArticle[]>();
        let anyWriteFailed = false;

        for (const [ticker, articles] of byTicker) {
            const results = await Promise.allSettled(
                articles.map((article) => this.firestoreService.createNewsIfAbsent(article)),
            );

            const created: StockNewsArticle[] = [];
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    anyWriteFailed = true;
                    return;
                }
                const article = articles[index];
                if (result.value && article) {
                    created.push(article);
                }
            });

            if (created.length > 0) {
                createdByTicker.set(ticker, created);
            }
        }

        return { createdByTicker, anyWriteFailed };
    }

    private async notifyTickers(
        createdByTicker: Map<string, StockNewsArticle[]>,
        cfg: StockNewsConfig,
    ): Promise<void> {
        for (const [ticker, created] of createdByTicker) {
            const claimed = await this.firestoreService.claimNotificationSlot(
                ticker,
                cfg.notificationCooldownSeconds,
            );
            if (!claimed) {
                _logger.info(`Cooldown active for ${ticker} — stored ${created.length} article(s) without notifying.`);
                continue;
            }
            try {
                await this.fcmService.sendNewsNotification(this.buildNotification(ticker, created));
            } catch (error) {
                _logger.error(`FCM send failed for ${ticker} — notification slot consumed; continuing.`, error);
            }
        }
    }

    private async advanceCursor(maxPublishedDate: string): Promise<void> {
        try {
            await this.firestoreService.advanceCursor(maxPublishedDate);
        } catch (error) {
            _logger.error('Failed to advance cursor — next run re-covers the window idempotently.', error);
        }
    }

    private buildNotification(ticker: string, created: StockNewsArticle[]): NewsNotificationInput {
        const sorted = [...created].sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
        const newest = sorted[0];
        if (!newest) {
            throw new Error(`buildNotification called with no articles for ${ticker}`);
        }
        const count = created.length;

        let title: string;
        let body: string;
        if (count === 1) {
            title = `${ticker} News`;
            body = newest.title.substring(0, NOTIFICATION_BODY_MAX_CHARS);
        } else {
            title = `${ticker}: ${count} new stories`;
            const maxTitleChars = NOTIFICATION_BODY_MAX_CHARS - MULTI_ARTICLE_BODY_SUFFIX.length;
            body = `${newest.title.substring(0, maxTitleChars)}${MULTI_ARTICLE_BODY_SUFFIX}`;
        }

        return {
            ticker,
            title,
            body,
            newsId: computeNewsId(newest.symbol, newest.url),
            url: newest.url,
            count,
        };
    }
}
