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

        const formatDate = (d: Date) => d.toISOString().substring(0, 10);

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const fromDateStr = formatDate(yesterday);
        const toDateStr = formatDate(nextWeek);

        _logger.info(`Running Earnings Notification cycle for ${fromDateStr} to ${toDateStr}`);

        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info('No tickers in watchlist. Skipping.');
            return;
        }

        const earnings = await this.marketDataService.getEarningsCalendar(fromDateStr, toDateStr);
        _logger.info(`Fetched ${earnings.length} earnings events.`);

        let notificationsSent = 0;
        for (const event of earnings) {
            if (watchedTickers.has(event.symbol)) {
                const companyName = watchedTickers.get(event.symbol) || event.symbol;

                const now = new Date();
                now.setHours(0, 0, 0, 0);

                const target = new Date(event.date + 'T00:00:00');

                const diffTime = target.getTime() - now.getTime();
                const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (daysDiff < -1 || daysDiff > 7) continue;

                const title = `${event.symbol} Earnings Update`;
                let body = '';

                if (daysDiff === -1) {
                    body = `${companyName} released their earnings yesterday. Check out how they did last period!`;
                } else {
                    const daysText = daysDiff === 0 ? 'today' : `in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
                    body = `${companyName} is releasing their earnings ${daysText}!`;
                }

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
