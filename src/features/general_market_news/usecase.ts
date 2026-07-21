import { Logger } from '../../core/logger';
import { getRemoteConfig, GeneralMarketNewsConfig } from '../../core/remote-config';
import { GeneralNewsArticle } from './models/GeneralNewsArticle';
import { FIRST_RUN_MAX_BACKFILL_PAGES, FIRST_RUN_MAX_PAGES } from './constants';
import { computeOverlapCutoff, formatEasternWallTime } from '../../core/date_utils';
import { FirestoreService } from './services/firestore_service';
import { FmpNewsService } from './services/fmp_news_service';

const _logger = new Logger('General Market News Usecase');

interface StoreResult {
    created: number;
    anyWriteFailed: boolean;
}

export class GeneralMarketNewsUseCase {

    constructor(
        private fmpNewsService: FmpNewsService,
        private firestoreService: FirestoreService,
    ) { }

    async execute(): Promise<void> {
        const cfg = (await getRemoteConfig()).general_market_news;

        const leaseAcquired = await this.tryAcquireLease(cfg.runIntervalSeconds);
        if (!leaseAcquired) {
            return;
        }

        try {
            await this.runPipeline(cfg);
        } finally {
            await this.firestoreService.releaseLease();
        }
    }

    private async tryAcquireLease(runIntervalSeconds: number): Promise<boolean> {
        let leaseAcquired: boolean;
        try {
            leaseAcquired = await this.firestoreService.acquireLease(runIntervalSeconds);
        } catch (error) {
            _logger.error('Failed to acquire lease transaction — next scheduled run retries.', error);
            return false;
        }
        if (!leaseAcquired) {
            _logger.debug('Lease held by another run, or poll interval has not elapsed. Exiting.');
        }
        return leaseAcquired;
    }

    private async runPipeline(cfg: GeneralMarketNewsConfig): Promise<void> {
        const { watermark, firstRun } = await this.resolveWatermark(cfg);
        const fetchCfg: GeneralMarketNewsConfig = firstRun
            ? { ...cfg, maxPages: FIRST_RUN_MAX_PAGES, maxBackfillPages: FIRST_RUN_MAX_BACKFILL_PAGES }
            : cfg;
        const fetchResult = await this.fetchSinceWatermark(watermark, fetchCfg);
        if (fetchResult === null) {
            return;
        }

        const eligible = this.filterEligibleArticles(fetchResult.articles, watermark, cfg);
        const { created, anyWriteFailed } = await this.storeArticles(eligible);

        _logger.info(
            `Fetched ${fetchResult.articles.length} article(s); ${eligible.length} in range; ${created} freshly created.`,
            { fetched: fetchResult.articles.length, eligible: eligible.length, created },
        );

        if (anyWriteFailed) {
            _logger.error('One or more article writes failed — skipping cursor advance; next run re-fetches.');
            return;
        }
        await this.advanceCursor(fetchResult.maxPublishedDate);
    }

    private async resolveWatermark(
        cfg: GeneralMarketNewsConfig,
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
        fetchCfg: GeneralMarketNewsConfig,
    ): Promise<{ articles: GeneralNewsArticle[]; maxPublishedDate: string } | null> {
        try {
            return await this.fmpNewsService.fetchSinceWatermark(watermark, fetchCfg);
        } catch (error) {
            _logger.error('FMP fetch failed after retries — cursor not advanced; next run re-covers the window.', error);
            return null;
        }
    }

    private filterEligibleArticles(
        articles: GeneralNewsArticle[],
        watermark: string,
        cfg: GeneralMarketNewsConfig,
    ): GeneralNewsArticle[] {
        const overlapCutoff = computeOverlapCutoff(watermark, cfg.overlapWindowSeconds);
        return articles.filter((a) => a.publishedDate >= overlapCutoff);
    }

    private async storeArticles(eligible: GeneralNewsArticle[]): Promise<StoreResult> {
        const results = await Promise.allSettled(
            eligible.map((article) => this.firestoreService.createNewsIfAbsent(article)),
        );

        let created = 0;
        let anyWriteFailed = false;
        for (const result of results) {
            if (result.status === 'rejected') {
                anyWriteFailed = true;
                continue;
            }
            if (result.value) {
                created++;
            }
        }

        return { created, anyWriteFailed };
    }

    private async advanceCursor(maxPublishedDate: string): Promise<void> {
        try {
            await this.firestoreService.advanceCursor(maxPublishedDate);
        } catch (error) {
            _logger.error('Failed to advance cursor — next run re-covers the window idempotently.', error);
        }
    }
}
