import { Logger } from '../../core/logger';
import { retry } from '../../core/retry';
import { runWithConcurrency } from '../../core/concurrency';
import { getRemoteConfig, YtdPriceChangeConfig } from '../../core/remote-config';
import { WatchlistService } from '../../core/services/watchlist_service';
import { subtractCalendarDays, todayEasternDate } from '../../core/date_utils';
import { RUN_DURATION_WARN_MS } from './constants';
import { FetchWindow } from './services/fmp_client';
import { FmpEodService } from './services/fmp_eod_service';
import { FirestoreService } from './services/firestore_service';
import { buildYtdSnapshot } from './snapshot';

const _logger = new Logger('Ytd Price Sync Usecase');

const WATCHLIST_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
};

type TickerOutcome = 'written' | 'skipped' | 'failed';

type RunCounts = Record<TickerOutcome, number>;

interface TickerContext {
    ticker: string;
    companyName: string;
    year: number;
    window: FetchWindow;
}

interface RunContext {
    year: number;
    window: FetchWindow;
    fetchConcurrency: number;
}

export class YtdPriceSyncUseCase {

    constructor(
        private fmpEodService: FmpEodService,
        private firestoreService: FirestoreService,
        private watchlistService: WatchlistService,
    ) { }

    async execute(): Promise<void> {
        const startedAt = Date.now();
        const today = todayEasternDate(startedAt);
        const year = Number(today.slice(0, 4));

        const config = (await getRemoteConfig()).ytd_price_change;

        const watchlist = await this.loadWatchlist(config);
        if (watchlist === null) {
            return;
        }

        const window: FetchWindow = {
            from: subtractCalendarDays(`${year}-01-01`, config.baselineLookbackCalendarDays),
            to: today,
        };

        const counts = await this.processWatchlist(watchlist, {
            year,
            window,
            fetchConcurrency: config.fetchConcurrency,
        });

        this.logRunSummary(counts, watchlist.size, Date.now() - startedAt);
    }

    private async loadWatchlist(config: YtdPriceChangeConfig): Promise<Map<string, string> | null> {
        let watchlist: Map<string, string>;
        try {
            watchlist = await retry(
                () => this.watchlistService.getAllWatchedTickers(config.watchlistCacheSeconds),
                WATCHLIST_RETRY_OPTIONS,
            );
        } catch (error) {
            _logger.error('Failed to load watchlist after retries — next fire retries.', error);
            return null;
        }
        if (watchlist.size === 0) {
            _logger.info('No tickers watched. Exiting.');
            return null;
        }
        return watchlist;
    }

    private async processWatchlist(
        watchlist: Map<string, string>,
        run: RunContext,
    ): Promise<RunCounts> {
        const counts: RunCounts = { written: 0, skipped: 0, failed: 0 };
        const entries = [...watchlist.entries()];
        await runWithConcurrency(entries, run.fetchConcurrency, async ([ticker, companyName]) => {
            try {
                const outcome = await this.processTicker({
                    ticker,
                    companyName,
                    year: run.year,
                    window: run.window,
                });
                counts[outcome]++;
            } catch (error) {
                counts.failed++;
                _logger.error(`Failed processing ${ticker} — next fire recomputes.`, error);
            }
        });
        return counts;
    }

    private async processTicker(ctx: TickerContext): Promise<TickerOutcome> {
        const { ticker, companyName, year, window } = ctx;

        const closes = await this.fmpEodService.fetchDailyCloses(ticker, window);

        const snapshot = buildYtdSnapshot({ ticker, companyName, year, closes });
        if (snapshot === null) {
            _logger.debug(`No YTD baseline for ${ticker}; existing document left untouched.`);
            return 'skipped';
        }

        await this.firestoreService.upsertYtd(snapshot);
        return 'written';
    }

    private logRunSummary(counts: RunCounts, total: number, durationMs: number): void {
        const line = `${counts.written} written / ${counts.skipped} skipped / ${counts.failed} failed `
            + `of ${total} (${durationMs}ms)`;
        if (durationMs > RUN_DURATION_WARN_MS) {
            _logger.warn(`Run exceeded ${RUN_DURATION_WARN_MS}ms — tune fetchConcurrency. ${line}`);
        } else {
            _logger.info(line);
        }
    }

}
