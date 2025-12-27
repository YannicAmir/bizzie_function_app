
import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';

const _logger = new Logger('SEC Service');

export interface SecFiling {
    symbol: string;
    filingDate: string; // Corrected from fillingDate
    acceptedDate: string;
    period?: string; // Optional as it might not be in the response
    formType: string; // "10-K" or "10-Q"
    link: string; // FMP returned link
    finalLink: string; // Unique URL, used for deduplication ID
    cik: string;
}

export interface SecService {
    getFilings(type: '10-K' | '10-Q', startDate: string, endDate: string): Promise<SecFiling[]>;
}

export class FmpSecService implements SecService {
    private baseUrl = 'https://financialmodelingprep.com/stable';

    constructor(private apiKey: string) { }

    async getFilings(type: '10-K' | '10-Q', startDate: string, endDate: string): Promise<SecFiling[]> {
        const results: SecFiling[] = [];
        let page = 0;
        const limit = 1000; // API Max Limit
        let keepFetching = true;

        _logger.info(`Fetching ${type} filings from ${startDate} to ${endDate}...`);

        while (keepFetching) {
            const pageResults = await retry(async () => {
                const url = `${this.baseUrl}/sec-filings-search/form-type?formType=${type}&from=${startDate}&to=${endDate}&page=${page}&limit=${limit}&apikey=${this.apiKey}`;
                // _logger.debug(`Fetching page ${page}: ${url}`); // Be careful logging API keys if DEBUG is on (url contains key)

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (!Array.isArray(data)) {
                    // Sometimes FMP returns an error object
                    _logger.error("API returned non-array:", data);
                    return [];
                }
                return data as SecFiling[];
            }, {
                maxAttempts: 3,
                initialDelayMs: 1000,
                backoffFactor: 2
            });

            if (pageResults.length > 0) {
                results.push(...pageResults);
                _logger.info(`Page ${page}: Retrieved ${pageResults.length} filings.`);
            }

            // Pagination Logic
            if (pageResults.length < limit) {
                keepFetching = false;
            } else {
                page++;
                // Safety brake to avoid infinite loops if API is misbehaving
                if (page > 20) {
                    _logger.warn("Hit safety page limit (20). Stopping fetch.");
                    keepFetching = false;
                }
            }
        }

        _logger.info(`Total ${type} filings fetched: ${results.length}`);
        return results;
    }
}
