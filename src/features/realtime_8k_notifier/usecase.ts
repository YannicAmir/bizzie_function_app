import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService } from '../../core/services/sec_service'; // Reuse generic fetcher
import { FilingHistoryService } from '../../core/services/filing_history_service'; // Reuse dedupe logic
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

        // 1. Fetch Global Watchlist
        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info("No tickers watched. Exiting.");
            return;
        }

        // 2. Fetch "Today's" 8-Ks
        const now = targetDate ? new Date(targetDate) : new Date();
        const todayStr = now.toISOString().split('T')[0] || '';

        // We fetch for "Today" and rely on dedupe to filter out old ones from earlier today.
        // This is safer than trying to do math on "last 15 minutes" via local timestamps.
        const filings = await this.secService.getFilings('8-K', todayStr, todayStr);
        _logger.info(`Fetched ${filings.length} 8-K filings for today (${todayStr}).`);

        // 3. Process Filings
        for (const filing of filings) {
            // A. Watchlist Filter
            if (!watchedTickers.has(filing.symbol)) {
                continue;
            }

            // B. Deduplication Filter
            if (await this.filingHistoryService.hasProcessed(filing)) {
                continue;
            }

            // C. Enrichment (AI)
            _logger.info(`Processing new 8-K for ${filing.symbol}...`);
            // Prioritize finalLink (authoritative), fallback to link if empty
            const targetLink = filing.finalLink || filing.link;

            const filingText = await this.secService.getFilingText(targetLink);
            if (!filingText) {
                _logger.warn(`Could not fetch text for ${filing.symbol}. Skipping.`);
                continue;
            }

            const enriched = await this.aiService.enrich8k(filingText);

            // D. Topic Filter (AI Decision)
            if (!enriched) {
                // Topic was null or processing failed
                // We still mark as processed so we don't retry and waste AI tokens on the same trash 8-K every 15 mins.
                await this.filingHistoryService.markProcessed(filing);
                continue;
            }

            // E. Save to DB (sec_filings) - Consolidating 8-K, 10-K, 10-Q
            await getFirebaseAdmin().firestore().collection('sec_filings').add({
                symbol: filing.symbol,
                companyName: watchedTickers.get(filing.symbol) || filing.symbol,
                formType: '8-K', // Explicitly set type
                ...enriched,
                filingDate: filing.filingDate,
                link: targetLink,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // F. Notify
            const companyName = watchedTickers.get(filing.symbol) || filing.symbol;
            let title = '';
            let body = '';

            if (enriched.isEarnings) {
                title = `${filing.symbol}’s Earnings Are In!`;
                body = `Find out how ${companyName} performed this past period.`;
            } else {
                title = `${filing.symbol} Breaking News`;
                body = enriched.summary; // The "tagline" from AI
            }

            await this.notificationService.sendTopicNotification(
                filing.symbol,
                title,
                body,
                {
                    type: '8k_filing',
                    ticker: filing.symbol,
                    topic: enriched.topic,
                    isEarnings: String(enriched.isEarnings),
                    link: targetLink
                }
            );

            // G. Mark Complete
            await this.filingHistoryService.markProcessed(filing);
            _logger.info(`Processed & Notified 8-K for ${filing.symbol} (${enriched.topic})`);
        }
    }
}
