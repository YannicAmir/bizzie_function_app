import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService, SecFiling, FORM_TYPE_10K, FORM_TYPE_10Q } from '../../core/services/sec_service';
import { FilingHistoryService } from '../../core/services/filing_history_service';
import { AiService, EnrichedFinancialData } from '../../core/services/ai_service';
import { SecFilingsRepository, SaveFinancialReportParams } from '../../core/services/sec_filings_repository';

import { easternDateString } from '../../core/time';

const _logger = new Logger('SEC Filings Usecase');

const WATCHLIST_CACHE_SECONDS = 300;
const NOTIFICATION_TYPE = 'sec_filing';
const PERIOD_ANNUAL = 'year';
const PERIOD_QUARTERLY = 'quarter';

type FilingOutcome = 'skipped' | 'deduped' | 'sent' | 'failed';

export class SecFilingsNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private secService: SecService,
        private filingHistoryService: FilingHistoryService,
        private notificationService: NotificationService,
        private aiService: AiService,
        private secFilingsRepository: SecFilingsRepository
    ) { }

    async execute(targetDate?: Date): Promise<void> {
        const dateStr = easternDateString(targetDate ?? new Date());
        _logger.info(`Running SEC Filings Check for ${dateStr}`);

        _logger.info("Fetching global watchlist...");
        const watchedTickers = await this.watchlistService.getAllWatchedTickers(WATCHLIST_CACHE_SECONDS);
        if (watchedTickers.size === 0) {
            _logger.info("Watchlist is empty. Exiting.");
            return;
        }
        _logger.info(`Monitoring ${watchedTickers.size} tickers.`);

        const filings = await this.fetchFilings(dateStr);

        const tally: Record<FilingOutcome, number> = { skipped: 0, deduped: 0, sent: 0, failed: 0 };
        for (const filing of filings) {
            tally[await this.processFiling(filing, watchedTickers)]++;
        }

        _logger.info(`Cycle Check Complete. Stats:`);
        _logger.info(`- Skipped (Not Watched): ${tally.skipped}`);
        _logger.info(`- Deduped (Already Sent): ${tally.deduped}`);
        _logger.info(`- Sent (New): ${tally.sent}`);
        if (tally.failed > 0) {
            _logger.error(`- Failed (Send/Persist): ${tally.failed}`);
        }
    }

    private async fetchFilings(dateStr: string): Promise<SecFiling[]> {
        const [filings10K, filings10Q] = await Promise.all([
            this.secService.getFilings({ type: FORM_TYPE_10K, startDate: dateStr, endDate: dateStr }),
            this.secService.getFilings({ type: FORM_TYPE_10Q, startDate: dateStr, endDate: dateStr }),
        ]);

        const allFilings = [...filings10K, ...filings10Q];
        _logger.info(`Fetched ${allFilings.length} total filings (${filings10K.length} 10-Ks, ${filings10Q.length} 10-Qs).`);
        return allFilings;
    }

    private async processFiling(filing: SecFiling, watchedTickers: Map<string, string>): Promise<FilingOutcome> {
        if (!watchedTickers.has(filing.symbol)) {
            return 'skipped';
        }

        if (!(await this.filingHistoryService.claimForProcessing(filing))) {
            return 'deduped';
        }

        const targetLink = filing.finalLink || filing.link;
        const companyName = watchedTickers.get(filing.symbol) || filing.symbol;

        try {
            const aiData = await this.analyzeFiling(filing, targetLink);
            await this.persist({ filing, enriched: aiData, companyName, link: targetLink });
            await this.notify(filing, targetLink, aiData);
            await this.filingHistoryService.markSent(filing);
            return 'sent';
        } catch (err) {
            _logger.error(`Failed to send/persist ${filing.formType} for ${filing.symbol}; releasing claim.`, err);
            await this.filingHistoryService.releaseClaim(filing);
            return 'failed';
        }
    }

    private async analyzeFiling(filing: SecFiling, targetLink: string): Promise<EnrichedFinancialData> {
        const fallback: EnrichedFinancialData = {
            revenue: null,
            eps: null,
            reportingCurrency: null,
            summary: `${filing.formType} filed.`,
        };

        if (!targetLink) {
            return fallback;
        }

        try {
            _logger.info(`Analyzing ${filing.formType} for ${filing.symbol}...`);
            const textResult = await this.secService.getFilingText(targetLink);
            if (textResult.status !== 'ok') {
                return fallback;
            }

            const result = await this.aiService.enrichFinancialReport(textResult.text, filing.formType);
            if (!result) {
                return fallback;
            }

            _logger.info(`AI Analysis for ${filing.symbol}: ${JSON.stringify(result)}`);
            return result;
        } catch (err) {
            _logger.error(`Failed to run AI analysis for ${filing.symbol}`, err);
            return fallback;
        }
    }

    private persist(params: SaveFinancialReportParams): Promise<void> {
        return this.secFilingsRepository.save(params);
    }

    private notify(filing: SecFiling, targetLink: string, aiData: EnrichedFinancialData): Promise<void> {
        const periodText = filing.formType === FORM_TYPE_10K ? PERIOD_ANNUAL : PERIOD_QUARTERLY;
        const title = `${filing.symbol}'s ${filing.formType} is now available`;

        return this.notificationService.sendTopicNotification(
            filing.symbol,
            title,
            aiData.summary,
            {
                type: NOTIFICATION_TYPE,
                ticker: filing.symbol,
                formType: filing.formType,
                period: filing.period || periodText,
                link: targetLink,
                filingDate: filing.filingDate,
            }
        );
    }
}
