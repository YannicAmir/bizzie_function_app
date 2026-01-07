import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { getRemoteConfig } from '../../../core/remote-config';

const _logger = new Logger('Market Data Service');

export interface EarningsEvent {
    date: string;
    symbol: string;
    epsActual: number | null;
    epsEstimated: number | null;
    revenueActual: number | null;
    revenueEstimated: number | null;
    lastUpdated: string;
    time?: string;
}

export interface MarketDataService {
    getEarningsCalendar(startDate: string, endDate: string): Promise<EarningsEvent[]>;
}


interface FmpEarningsEventDTO {
    date: string;
    symbol: string;
    epsActual: number | null;
    epsEstimated: number | null;
    revenueActual: number | null;
    revenueEstimated: number | null;
    lastUpdated: string;
    time?: string;
}

export class FmpMarketDataService implements MarketDataService {

    constructor(private apiKey: string) { }

    async getEarningsCalendar(startDate: string, endDate: string): Promise<EarningsEvent[]> {
        return retry(async () => {
            const config = await getRemoteConfig();
            const baseUrl = config.fmp.baseUrl;
            const url = `${baseUrl}/earnings-calendar?from=${startDate}&to=${endDate}&apikey=${this.apiKey}`;
            _logger.info(`Fetching earnings calendar from ${startDate} to ${endDate}...`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
            }

            const rawData = await response.json() as FmpEarningsEventDTO[];

            return rawData.map((item) => {
                const event: EarningsEvent = {
                    date: item.date,
                    symbol: item.symbol,
                    epsActual: item.epsActual,
                    epsEstimated: item.epsEstimated,
                    revenueActual: item.revenueActual,
                    revenueEstimated: item.revenueEstimated,
                    lastUpdated: item.lastUpdated
                };

                if (item.time) {
                    event.time = item.time;
                }

                return event;
            });
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            backoffFactor: 2
        });
    }
}
