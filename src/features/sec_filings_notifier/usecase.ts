
import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService, SecFiling } from './services/sec_service';
import { FilingHistoryService } from './services/filing_history_service';

const _logger = new Logger('SEC Filings Usecase');

export class SecFilingsNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private secService: SecService,
        private filingHistoryService: FilingHistoryService,
        private notificationService: NotificationService
    ) { }

    async execute(targetDate?: Date): Promise<void> {
        // 1. Calculate Date Range (Yesterday -> Today)
        // We want to "Catch Up" on anything we might have missed or that was filed late yesterday.
        // Use targetDate if provided (for testing), otherwise use real Now.
        const today = targetDate ? new Date(targetDate) : new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const formatDate = (d: Date) => d.toISOString().substring(0, 10);
        const fromDateStr = formatDate(yesterday);
        const toDateStr = formatDate(today);

        _logger.info(`Running SEC Filings Check from ${fromDateStr} to ${toDateStr}`);

        // 2. Refresh Watchlist
        _logger.info("Fetching global watchlist...");
        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info("Watchlist is empty. Exiting.");
            return;
        }
        _logger.info(`Monitoring ${watchedTickers.size} tickers.`);

        // 3. Fetch Filings (10-K and 10-Q)
        // We run these sequentially or parallel, but handle them as distinct lists
        const filings10K = await this.secService.getFilings('10-K', fromDateStr, toDateStr);
        const filings10Q = await this.secService.getFilings('10-Q', fromDateStr, toDateStr);

        const allFilings = [...filings10K, ...filings10Q];
        _logger.info(`Fetched ${allFilings.length} total filings (${filings10K.length} 10-Ks, ${filings10Q.length} 10-Qs).`);

        // 4. Filter & Process
        let sentCount = 0;
        let skippedCount = 0;
        let dedupedCount = 0;

        for (const filing of allFilings) {
            // A. Check Watchlist
            if (!watchedTickers.has(filing.symbol)) {
                skippedCount++;
                continue;
            }

            // B. Check Deduplication
            const isProcessed = await this.filingHistoryService.hasProcessed(filing);
            if (isProcessed) {
                dedupedCount++;
                continue;
            }

            // C. Prepare Notification
            const companyName = watchedTickers.get(filing.symbol) || filing.symbol;

            // Logic: 10-K -> "year", 10-Q -> "quarter"
            const periodText = filing.formType === '10-K' ? 'year' : 'quarter';

            // Title: [TICKER] SEC Filing Update
            const title = `${filing.symbol} SEC Filing Update`;

            // Body: [Company]'s [Type] is ready for you to view. See how the company did this past [period]!
            const body = `${companyName}'s ${filing.formType} is ready for you to view. See how the company did this past ${periodText}!`;

            // D. Send Notification (Sequential Execution for FCM Stability)
            await this.notificationService.sendTopicNotification(
                filing.symbol,
                title,
                body,
                {
                    type: 'sec_filing',
                    ticker: filing.symbol,
                    formType: filing.formType,
                    period: filing.period || periodText, // Fallback if missing
                    link: filing.finalLink,
                    filingDate: filing.filingDate
                }
            );
            sentCount++;

            // E. Mark as Processed
            await this.filingHistoryService.markProcessed(filing);
        }

        _logger.info(`Cycle Check Complete. Stats:`);
        _logger.info(`- Skipped (Not Watched): ${skippedCount}`);
        _logger.info(`- Deduped (Already Sent): ${dedupedCount}`);
        _logger.info(`- Sent (New): ${sentCount}`);
    }
}
