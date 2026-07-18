import { Logger } from '../../core/logger';
import { retry } from '../../core/retry';
import { runWithConcurrency } from '../../core/concurrency';
import { getRemoteConfig, StockPricesConfig } from '../../core/remote-config';
import { WatchlistService } from '../../core/services/watchlist_service';
import { RUN_DURATION_WARN_MS } from './constants';
import { IntradayBar } from './models/IntradayBar';
import { PriceSnapshot } from './models/PriceSnapshot';
import { buildFinalizedSnapshot, buildIntradaySnapshot } from './snapshot';
import { Phase, resolvePhase } from './phase';
import { selectCohort } from './cohort';
import { PreviousCloseResolver } from './previous_close';
import { easternMinutesSinceMidnight, todayEasternDate } from '../../core/date_utils';
import { FmpChartService } from './services/fmp_chart_service';
import { FirestoreService } from './services/firestore_service';

const _logger = new Logger('Stock Price Sync Usecase');

const WATCHLIST_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
};

type TickerOutcome = 'written' | 'skipped' | 'failed';

interface TickerContext {
    ticker: string;
    companyName: string;
    cfg: StockPricesConfig;
    today: string;
}

type RunCounts = Record<TickerOutcome, number>;

interface RunContext {
    phase: Phase;
    cfg: StockPricesConfig;
    today: string;
}

interface RunSummary {
    counts: RunCounts;
    cohortSize: number;
    durationMs: number;
}

type FinalizeGate =
    | { proceed: true; previousClose: number | null; officialClose: number }
    | { proceed: false; outcome: TickerOutcome };

const latestBarAtCache = new Map<string, string>();
const finalizedCache = new Map<string, string>();

export class StockPriceSyncUseCase {

    constructor(
        private fmpChartService: FmpChartService,
        private previousClose: PreviousCloseResolver,
        private firestoreService: FirestoreService,
        private watchlistService: WatchlistService,
    ) { }
    async execute(): Promise<void> {
        const startedAt = Date.now();

        const minuteOfDay = easternMinutesSinceMidnight(startedAt);
        const phase = resolvePhase(minuteOfDay);
        if (phase === 'idle') {
            _logger.debug(`Idle phase (ET minute ${minuteOfDay}); skipping run.`);
            return;
        }

        const cfg = (await getRemoteConfig()).stock_prices;
        const watchlist = await this.loadWatchlist(cfg);
        if (watchlist === null) {
            return;
        }

        const run: RunContext = { phase, cfg, today: todayEasternDate(startedAt) };
        const cohort = selectCohort(watchlist, cfg.maxCallsPerRun, minuteOfDay);
        const counts = await this.processCohort(run, cohort);

        this.logRunSummary(phase, { counts, cohortSize: cohort.length, durationMs: Date.now() - startedAt });
    }

    private async loadWatchlist(cfg: StockPricesConfig): Promise<Map<string, string> | null> {
        let watchlist: Map<string, string>;
        try {
            watchlist = await retry(
                () => this.watchlistService.getAllWatchedTickers(cfg.watchlistCacheSeconds),
                WATCHLIST_RETRY_OPTIONS,
            );
        } catch (error) {
            _logger.error('Failed to load watchlist after retries — next minute retries.', error);
            return null;
        }
        if (watchlist.size === 0) {
            _logger.info('No tickers watched. Exiting.');
            return null;
        }
        return watchlist;
    }

    private async processCohort(run: RunContext, cohort: Array<[string, string]>): Promise<RunCounts> {
        const counts: RunCounts = { written: 0, skipped: 0, failed: 0 };
        await runWithConcurrency(cohort, run.cfg.fetchConcurrency, async ([ticker, companyName]) => {
            try {
                const outcome = await this.processTicker(run.phase, {
                    ticker, companyName, cfg: run.cfg, today: run.today,
                });
                counts[outcome]++;
            } catch (error) {
                counts.failed++;
                _logger.error(`Unexpected failure processing ${ticker}.`, error);
            }
        });
        return counts;
    }

    private logRunSummary(phase: Phase, summary: RunSummary): void {
        const { counts, cohortSize, durationMs } = summary;
        const line = `[${phase}] ${counts.written} written / ${counts.skipped} skipped / ${counts.failed} failed `
            + `of ${cohortSize} (${durationMs}ms)`;
        if (phase === 'intraday' && durationMs > RUN_DURATION_WARN_MS) {
            _logger.warn(`Run exceeded ${RUN_DURATION_WARN_MS}ms — tune fetchConcurrency/maxCallsPerRun. ${line}`);
        } else {
            _logger.info(line);
        }
    }

    private processTicker(phase: Phase, ctx: TickerContext): Promise<TickerOutcome> {
        switch (phase) {
            case 'seed':
                return this.processSeed(ctx);
            case 'finalize':
                return this.processFinalize(ctx);
            default:
                return this.processIntraday(ctx);
        }
    }

    private async processSeed(ctx: TickerContext): Promise<TickerOutcome> {
        const { ticker, cfg, today } = ctx;
        if (this.previousClose.isFresh(ticker, today)) {
            return 'skipped';
        }
        try {
            const { previousClose } = await this.previousClose.resolve(ticker, cfg, today);
            this.previousClose.cache(ticker, today, previousClose);
            return 'skipped';
        } catch (error) {
            _logger.error(`EOD seed failed for ${ticker} — next run retries.`, error);
            return 'failed';
        }
    }

    private async processIntraday(ctx: TickerContext): Promise<TickerOutcome> {
        const { ticker, companyName, cfg, today } = ctx;
        const previousClose = await this.previousClose.resolveCachedPreviousClose(ticker, cfg, today);

        const bars = await this.fetchTodayBars(ticker, today, 'intraday');
        if (bars === null) {
            return 'failed';
        }

        const snapshot = buildIntradaySnapshot({
            ticker, companyName, bars, previousClose, today, bucketMinutes: cfg.seriesBucketMinutes,
        });
        if (snapshot === null) {
            _logger.debug(`No today bars for ${ticker}; existing document left untouched.`);
            return 'skipped';
        }

        if (latestBarAtCache.get(ticker) === snapshot.latestBarAt) {
            return 'skipped';
        }

        const outcome = await this.writeSnapshot(snapshot, 'intraday');
        if (outcome === 'written') {
            latestBarAtCache.set(ticker, snapshot.latestBarAt);
        }
        return outcome;
    }

    private async processFinalize(ctx: TickerContext): Promise<TickerOutcome> {
        const { ticker, companyName, cfg, today } = ctx;

        const gate = await this.resolveFinalizeClose(ticker, cfg, today);
        if (!gate.proceed) {
            return gate.outcome;
        }

        const bars = await this.fetchTodayBars(ticker, today, 'finalize');
        if (bars === null) {
            return 'failed';
        }

        const snapshot = buildFinalizedSnapshot(
            { ticker, companyName, bars, previousClose: gate.previousClose, today, bucketMinutes: cfg.seriesBucketMinutes },
            gate.officialClose,
        );
        if (snapshot === null) {
            _logger.debug(`No today bars for ${ticker} at finalize; existing document left untouched.`);
            return 'skipped';
        }

        const outcome = await this.writeSnapshot(snapshot, 'finalize');
        if (outcome === 'written') {
            finalizedCache.set(ticker, today);
        }
        return outcome;
    }

    private async resolveFinalizeClose(
        ticker: string,
        cfg: StockPricesConfig,
        today: string,
    ): Promise<FinalizeGate> {
        let previousClose: number | null;
        let todayClose: number | null;
        try {
            const resolved = await this.previousClose.resolve(ticker, cfg, today);
            previousClose = resolved.previousClose;
            todayClose = resolved.todayClose;
        } catch (error) {
            _logger.error(`EOD finalize fetch failed for ${ticker} — a later run retries.`, error);
            return { proceed: false, outcome: 'failed' };
        }

        if (finalizedCache.get(ticker) === today) {
            return { proceed: false, outcome: 'skipped' };
        }
        if (todayClose === null) {
            _logger.debug(`Official EOD close not published yet for ${ticker}; will retry.`);
            return { proceed: false, outcome: 'skipped' };
        }
        this.previousClose.cache(ticker, today, previousClose);
        return { proceed: true, previousClose, officialClose: todayClose };
    }

    private async fetchTodayBars(ticker: string, today: string, phase: Phase): Promise<IntradayBar[] | null> {
        try {
            return await this.fmpChartService.fetchIntradayBars(ticker, { from: today, to: today });
        } catch (error) {
            _logger.error(`FMP fetch failed for ${ticker} during ${phase} — a later run retries.`, error);
            return null;
        }
    }

    private async writeSnapshot(snapshot: PriceSnapshot, phase: Phase): Promise<TickerOutcome> {
        try {
            await this.firestoreService.upsertPrice(snapshot);
            return 'written';
        } catch (error) {
            _logger.error(`Write failed for ${snapshot.ticker} during ${phase} — a later run retries.`, error);
            return 'failed';
        }
    }

}
