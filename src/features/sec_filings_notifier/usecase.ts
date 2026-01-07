
import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService } from '../../core/services/sec_service';
import { FilingHistoryService } from '../../core/services/filing_history_service';
import { AiService } from '../../core/services/ai_service';

import { getFirebaseAdmin } from '../../core/firebase';
import * as admin from 'firebase-admin';

const _logger = new Logger('SEC Filings Usecase');

export class SecFilingsNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private secService: SecService,
        private filingHistoryService: FilingHistoryService,
        private notificationService: NotificationService,
        private aiService: AiService
    ) { }

    async execute(targetDate?: Date): Promise<void> {
        const today = targetDate ? new Date(targetDate) : new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const formatDate = (d: Date) => d.toISOString().substring(0, 10);
        const fromDateStr = formatDate(yesterday);
        const toDateStr = formatDate(today);

        _logger.info(`Running SEC Filings Check from ${fromDateStr} to ${toDateStr}`);

        _logger.info("Fetching global watchlist...");
        const watchedTickers = await this.watchlistService.getAllWatchedTickers();
        if (watchedTickers.size === 0) {
            _logger.info("Watchlist is empty. Exiting.");
            return;
        }
        _logger.info(`Monitoring ${watchedTickers.size} tickers.`);

        const filings10K = await this.secService.getFilings('10-K', fromDateStr, toDateStr);
        const filings10Q = await this.secService.getFilings('10-Q', fromDateStr, toDateStr);

        const allFilings = [...filings10K, ...filings10Q];
        _logger.info(`Fetched ${allFilings.length} total filings (${filings10K.length} 10-Ks, ${filings10Q.length} 10-Qs).`);

        let sentCount = 0;
        let skippedCount = 0;
        let dedupedCount = 0;

        for (const filing of allFilings) {
            if (!watchedTickers.has(filing.symbol)) {
                skippedCount++;
                continue;
            }

            const isProcessed = await this.filingHistoryService.hasProcessed(filing);
            if (isProcessed) {
                dedupedCount++;
                continue;
            }

            const companyName = watchedTickers.get(filing.symbol) || filing.symbol;
            const periodText = filing.formType === '10-K' ? 'year' : 'quarter';

            let aiData = { revenue: null as string | null, eps: null as string | null, summary: `${filing.formType} filed.` };

            try {
                const targetLink = filing.finalLink || filing.link;
                if (targetLink) {
                    _logger.info(`Analyzing ${filing.formType} for ${filing.symbol}...`);
                    const filingText = await this.secService.getFilingText(targetLink);
                    if (filingText) {
                        const result = await this.aiService.enrichFinancialReport(filingText, filing.formType);
                        if (result) {
                            aiData = result;
                            _logger.info(`AI Analysis for ${filing.symbol}: ${JSON.stringify(aiData)}`);
                        }
                    }
                }
            } catch (err) {
                _logger.error(`Failed to run AI analysis for ${filing.symbol}`, err);
            }

            const title = `${filing.symbol}'s ${filing.formType} is now available`;

            const body = aiData.summary;

            await this.notificationService.sendTopicNotification(
                filing.symbol,
                title,
                body,
                {
                    type: 'sec_filing',
                    ticker: filing.symbol,
                    formType: filing.formType,
                    period: filing.period || periodText,
                    link: filing.finalLink,
                    filingDate: filing.filingDate
                }
            );
            sentCount++;

            await getFirebaseAdmin().firestore().collection('sec_filings').add({
                symbol: filing.symbol,
                companyName: companyName,
                formType: filing.formType,
                filingDate: filing.filingDate,
                link: filing.finalLink,
                summary: aiData.summary,
                revenue: aiData.revenue,
                eps: aiData.eps,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await this.filingHistoryService.markProcessed(filing);
        }

        _logger.info(`Cycle Check Complete. Stats:`);
        _logger.info(`- Skipped (Not Watched): ${skippedCount}`);
        _logger.info(`- Deduped (Already Sent): ${dedupedCount}`);
        _logger.info(`- Sent (New): ${sentCount}`);
    }
}
