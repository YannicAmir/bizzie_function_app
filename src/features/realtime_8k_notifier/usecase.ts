import { Logger } from '../../core/logger';
import { WatchlistService } from '../../core/services/watchlist_service';
import { NotificationService } from '../../core/services/notification_service';
import { SecService, SecFiling, FORM_TYPE_8K } from '../../core/services/sec_service';
import { FilingHistoryService } from '../../core/services/filing_history_service';
import { SecFilingsRepository } from '../../core/services/sec_filings_repository';
import { AiService, Enriched8kData } from '../../core/services/ai_service';
import { easternDateString, easternTimestampString } from '../../core/time';

const _logger = new Logger('Realtime 8-K Usecase');

const WATCHLIST_CACHE_SECONDS = 300;
const FETCH_LOOKBACK_HOURS = 12;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const NOTIFICATION_TYPE = 'sec_filing';

interface FetchWindow {
    startDate: string;
    endDate: string;
    sinceAcceptedDate: string;
}

interface Notification {
    title: string;
    body: string;
}

export class Realtime8kNotifierUseCase {

    constructor(
        private watchlistService: WatchlistService,
        private secService: SecService,
        private filingHistoryService: FilingHistoryService,
        private secFilingsRepository: SecFilingsRepository,
        private notificationService: NotificationService,
        private aiService: AiService
    ) { }

    async execute(targetDate?: Date): Promise<void> {
        _logger.info("Starting Realtime 8-K Check...");

        const watchedTickers = await this.watchlistService.getAllWatchedTickers(WATCHLIST_CACHE_SECONDS);
        if (watchedTickers.size === 0) {
            _logger.info("No tickers watched. Exiting.");
            return;
        }

        const window = this.resolveFetchWindow(targetDate ?? new Date());
        const filings = await this.secService.getFilings({ type: FORM_TYPE_8K, ...window });
        _logger.info(`Fetched ${filings.length} 8-K filings for window ${window.startDate} → ${window.endDate} (ET), since ${window.sinceAcceptedDate}.`);

        for (const filing of filings) {
            if (!watchedTickers.has(filing.symbol)) {
                continue;
            }
            if (!(await this.filingHistoryService.claimForProcessing(filing))) {
                continue;
            }
            await this.processFiling(filing, watchedTickers);
        }
    }

    private resolveFetchWindow(now: Date): FetchWindow {
        return {
            startDate: easternDateString(new Date(now.getTime() - MS_PER_DAY)),
            endDate: easternDateString(now),
            sinceAcceptedDate: easternTimestampString(new Date(now.getTime() - FETCH_LOOKBACK_HOURS * MS_PER_HOUR)),
        };
    }

    private async processFiling(filing: SecFiling, watchedTickers: Map<string, string>): Promise<void> {
        const companyName = watchedTickers.get(filing.symbol) || filing.symbol;
        // claimForProcessing rejects filings without a finalLink, so it is guaranteed present here.
        const targetLink = filing.finalLink!;

        try {
            _logger.info(`Processing new 8-K for ${filing.symbol}...`);

            const textResult = await this.secService.getFilingText(targetLink);
            if (textResult.status === 'unavailable') {
                _logger.warn(`Could not fetch text for ${filing.symbol}. Releasing claim for retry.`);
                await this.filingHistoryService.releaseClaim(filing);
                return;
            }
            if (textResult.status === 'empty') {
                _logger.info(`Filing text empty for ${filing.symbol}; marking sent without notifying.`);
                await this.filingHistoryService.markSent(filing);
                return;
            }

            const enriched = await this.aiService.enrich8k(textResult.text);
            if (!enriched) {
                _logger.info(`No relevant 8-K enrichment for ${filing.symbol}; marking sent without notifying.`);
                await this.filingHistoryService.markSent(filing);
                return;
            }

            await this.deliverEnriched8k({ filing, enriched, companyName, link: targetLink });
            _logger.info(`Processed & Notified 8-K for ${filing.symbol} (${enriched.topic})`);
        } catch (error) {
            _logger.error(`Failed to process 8-K for ${filing.symbol}; releasing claim for retry.`, error);
            await this.filingHistoryService.releaseClaim(filing);
        }
    }

    private async deliverEnriched8k(params: {
        filing: SecFiling;
        enriched: Enriched8kData;
        companyName: string;
        link: string;
    }): Promise<void> {
        const { filing, enriched, companyName, link } = params;

        await this.secFilingsRepository.saveEnriched8k({ filing, enriched, companyName, link });

        const notification = this.buildNotification(filing, companyName, enriched);
        await this.notificationService.sendTopicNotification(
            filing.symbol,
            notification.title,
            notification.body,
            {
                type: NOTIFICATION_TYPE,
                ticker: filing.symbol,
                formType: FORM_TYPE_8K,
                topic: enriched.topic,
                isEarnings: String(enriched.isEarnings),
                link,
            }
        );

        await this.filingHistoryService.markSent(filing);
    }

    private buildNotification(filing: SecFiling, companyName: string, enriched: Enriched8kData): Notification {
        if (enriched.isEarnings) {
            return {
                title: `${filing.symbol}’s earnings are in!`,
                body: `Find out how ${companyName} performed this past period.`,
            };
        }
        return {
            title: `${filing.symbol} Breaking News`,
            body: enriched.summary,
        };
    }
}
