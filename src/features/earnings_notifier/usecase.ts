import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { MarketDataService } from './services/market_data_service';
import { NotificationService } from '../../core/services/notification_service';

const _logger = new Logger('Earnings Notifier Usecase');

export class EarningsNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private marketDataService: MarketDataService,
        private notificationService: NotificationService
    ) { }

    async execute(): Promise<void> {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        // Helper to format YYYY-MM-DD
        const formatDate = (d: Date) => d.toISOString().substring(0, 10);

        const fromDateStr = formatDate(today);
        const toDateStr = formatDate(nextWeek);

        _logger.info(`Running Earnings Notification cycle for ${fromDateStr} to ${toDateStr}`);

        // 1. Get Watchlist
        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info('No tickers in watchlist. Skipping.');
            return;
        }

        // 2. Get Earnings
        const earnings = await this.marketDataService.getEarningsCalendar(fromDateStr, toDateStr);
        _logger.info(`Fetched ${earnings.length} earnings events.`);

        // 3. Process
        let notificationsSent = 0;
        for (const event of earnings) {
            if (watchedTickers.has(event.symbol)) {
                // Get company name, defaulting to symbol if something went wrong
                const companyName = watchedTickers.get(event.symbol) || event.symbol;

                // Normalize current date to midnight for accurate day-diff
                const now = new Date();
                now.setHours(0, 0, 0, 0);

                // Normalize event date (default parsing is usually UTC midnight, so ensure local midnight consistency if needed)
                // Actually, simplest is direct string comparison for "TODAY" and date diff for others.
                // Let's use timestamp diffing for safety.
                const target = new Date(event.date + 'T00:00:00'); // Force midnight

                const diffTime = target.getTime() - now.getTime();
                const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (daysDiff < 0 || daysDiff > 7) continue;

                const daysText = daysDiff === 0 ? 'today' : `in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;

                // Construct Title and Body
                const title = `${event.symbol} Earnings Update`;
                const body = `${companyName} is releasing earnings ${daysText}!`;

                await this.notificationService.sendTopicNotification(
                    event.symbol,
                    title,
                    body,
                    {
                        type: 'earnings_reminder',
                        ticker: event.symbol,
                        eventDate: event.date,
                        daysRemaining: daysDiff.toString()
                    }
                );
                notificationsSent++;
            }
        }
        _logger.info(`Cycle complete. Sent ${notificationsSent} notifications.`);
    }
}
