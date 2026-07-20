import { Logger } from '../../core/logger';
import { StockPricesConfig } from '../../core/remote-config';
import { subtractCalendarDays } from '../../core/date_utils';
import { DailyClose } from './models/DailyClose';
import { FmpEodService } from './services/fmp_eod_service';

const _logger = new Logger('Previous Close Resolver');

interface PreviousCloseCacheEntry {
    sessionDate: string;
    previousClose: number | null;
}

export interface EodCloses {
    previousClose: number | null;
    todayClose: number | null;
}

const previousCloseCache = new Map<string, PreviousCloseCacheEntry>();

function latestCloseBefore(records: DailyClose[], today: string): number | null {
    let latestDate = '';
    let close: number | null = null;
    for (const record of records) {
        if (record.date < today && record.date > latestDate) {
            latestDate = record.date;
            close = record.close;
        }
    }
    return close;
}

function closeOn(records: DailyClose[], date: string): number | null {
    for (const record of records) {
        if (record.date === date) {
            return record.close;
        }
    }
    return null;
}

export class PreviousCloseResolver {

    constructor(private eodService: FmpEodService) { }

    isFresh(ticker: string, today: string): boolean {
        const cached = previousCloseCache.get(ticker);
        return cached !== undefined && cached.sessionDate === today;
    }

    cache(ticker: string, today: string, previousClose: number | null): void {
        previousCloseCache.set(ticker, { sessionDate: today, previousClose });
    }

    async resolve(ticker: string, cfg: StockPricesConfig, today: string): Promise<EodCloses> {
        const narrowFrom = subtractCalendarDays(today, cfg.eodLookbackCalendarDays);
        let records = await this.eodService.fetchDailyCloses(ticker, { from: narrowFrom, to: today });
        let previousClose = latestCloseBefore(records, today);

        if (previousClose === null) {
            const widenedFrom = subtractCalendarDays(today, cfg.eodFallbackCalendarDays);
            records = await this.eodService.fetchDailyCloses(ticker, { from: widenedFrom, to: today });
            previousClose = latestCloseBefore(records, today);
        }

        return { previousClose, todayClose: closeOn(records, today) };
    }

    async resolveCachedPreviousClose(ticker: string, cfg: StockPricesConfig, today: string): Promise<number | null> {
        const cached = previousCloseCache.get(ticker);
        if (cached !== undefined && cached.sessionDate === today) {
            return cached.previousClose;
        }
        try {
            const { previousClose } = await this.resolve(ticker, cfg, today);
            this.cache(ticker, today, previousClose);
            return previousClose;
        } catch (error) {
            _logger.warn(`EOD previousClose fetch failed for ${ticker} — writing with null change this run.`, {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}
