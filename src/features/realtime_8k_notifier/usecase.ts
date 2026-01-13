import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService } from '../../core/services/sec_service';
import { FilingHistoryService } from '../../core/services/filing_history_service';
import { AiService } from '../../core/services/ai_service';
import { getFirebaseAdmin } from '../../core/firebase';
import * as admin from 'firebase-admin';

const _logger = new Logger('Realtime 8-K Usecase');

export class Realtime8kNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private secService: SecService,
        private filingHistoryService: FilingHistoryService,
        private notificationService: NotificationService,
        private aiService: AiService
    ) { }

    async execute(targetDate?: Date): Promise<void> {
        _logger.info("Starting Realtime 8-K Check...");

        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info("No tickers watched. Exiting.");
            return;
        }

        const now = targetDate ? new Date(targetDate) : new Date();
        const todayStr = now.toISOString().split('T')[0] || '';
        const filings = await this.secService.getFilings('8-K', todayStr, todayStr);

        _logger.info(`Fetched ${filings.length} 8-K filings for today (${todayStr}).`);

        for (const filing of filings) {
            if (!watchedTickers.has(filing.symbol)) {
                continue;
            }
            if (await this.filingHistoryService.hasProcessed(filing)) {
                continue;
            }

            _logger.info(`Processing new 8-K for ${filing.symbol}...`);

            const targetLink = filing.finalLink || filing.link;

            const filingText = await this.secService.getFilingText(targetLink);
            if (!filingText) {
                _logger.warn(`Could not fetch text for ${filing.symbol}. Skipping.`);
                continue;
            }

            const enriched = await this.aiService.enrich8k(filingText);

            if (!enriched) {
                await this.filingHistoryService.markProcessed(filing);
                continue;
            }

            await getFirebaseAdmin().firestore().collection('sec_filings').add({
                symbol: filing.symbol,
                companyName: watchedTickers.get(filing.symbol) || filing.symbol,
                formType: '8-K',
                ...enriched,
                filingDate: filing.filingDate,
                link: targetLink,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const companyName = watchedTickers.get(filing.symbol) || filing.symbol;
            let title = '';
            let body = '';

            if (enriched.isEarnings) {
                title = `${filing.symbol}’s earnings are in!`;
                body = `Find out how ${companyName} performed this past period.`;
            } else {
                title = `${filing.symbol} Breaking News`;
                body = enriched.summary;
            }

            await this.notificationService.sendTopicNotification(
                filing.symbol,
                title,
                body,
                {
                    type: 'sec_filing',
                    ticker: filing.symbol,
                    formType: "8-K",
                    topic: enriched.topic,
                    isEarnings: String(enriched.isEarnings),
                    link: targetLink
                }
            );

            await this.filingHistoryService.markProcessed(filing);
            _logger.info(`Processed & Notified 8-K for ${filing.symbol} (${enriched.topic})`);
        }
    }
}
