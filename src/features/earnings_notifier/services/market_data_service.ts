import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';

const _logger = new Logger('Market Data Service');

export interface EarningsEvent {
    date: string;
    symbol: string;
    epsActual: number | null;
    epsEstimated: number | null;
    revenueActual: number | null;
    revenueEstimated: number | null;
    lastUpdated: string;
    time?: string; // Optional as it wasn't in the provided sample
}

export interface MarketDataService {
    getEarningsCalendar(startDate: string, endDate: string): Promise<EarningsEvent[]>;
}

export class FmpMarketDataService implements MarketDataService {
    private baseUrl = 'https://financialmodelingprep.com/stable';

    constructor(private apiKey: string) { }

    async getEarningsCalendar(startDate: string, endDate: string): Promise<EarningsEvent[]> {
        return retry(async () => {
            const url = `${this.baseUrl}/earnings-calendar?from=${startDate}&to=${endDate}&apikey=${this.apiKey}`;
            _logger.info(`Fetching earnings calendar from ${startDate} to ${endDate}...`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as any[];

            // Map raw data to our clean interface
            return data.map((item: any) => ({
                date: item.date,
                symbol: item.symbol,
                epsActual: item.epsActual,
                epsEstimated: item.epsEstimated,
                revenueActual: item.revenueActual,
                revenueEstimated: item.revenueEstimated,
                lastUpdated: item.lastUpdated,
                time: item.time // Keeping it if it exists, but interface marks it optional
            }));
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            backoffFactor: 2
        });
    }
}
