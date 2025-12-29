import { Logger } from '../logger';
import { retry } from '../retry';
import { getRemoteConfig } from '../remote-config';

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
    getFilings(type: '10-K' | '10-Q' | '8-K', startDate: string, endDate: string): Promise<SecFiling[]>;
    getFilingText(url: string): Promise<string>;
}

// Raw DTO from FMP
interface FmpSecFilingDTO {
    symbol: string;
    filingDate: string;
    acceptedDate: string;
    period?: string;
    formType: string;
    link: string;
    finalLink: string;
    cik: string;
}

export class FmpSecService implements SecService {
    constructor(private apiKey: string) { }

    async getFilings(type: '10-K' | '10-Q' | '8-K', startDate: string, endDate: string): Promise<SecFiling[]> {
        const results: SecFiling[] = [];
        let page = 0;
        const limit = 1000; // API Max Limit
        let keepFetching = true;

        _logger.info(`Fetching ${type} filings from ${startDate} to ${endDate}...`);

        while (keepFetching) {
            const pageResults = await retry(async () => {
                const config = await getRemoteConfig();
                const baseUrl = config.fmp.baseUrl;
                const url = `${baseUrl}/sec-filings-search/form-type?formType=${type}&from=${startDate}&to=${endDate}&page=${page}&limit=${limit}&apikey=${this.apiKey}`;
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

                // Safe Cast to DTO
                const dtos = data as FmpSecFilingDTO[];

                // Map to Domain Entity
                return dtos.map(dto => {
                    const filing: SecFiling = {
                        symbol: dto.symbol,
                        filingDate: dto.filingDate,
                        acceptedDate: dto.acceptedDate,
                        formType: dto.formType,
                        link: dto.link,
                        finalLink: dto.finalLink,
                        cik: dto.cik
                    };

                    if (dto.period) {
                        filing.period = dto.period;
                    }

                    return filing;
                });
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

    async getFilingText(url: string): Promise<string> {
        // Fetch raw text/html from the filing link
        try {
            // SEC.gov requires a User-Agent header: AppName/Version <email>
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'BizzieApp/1.0 (bizzie@example.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!response.ok) {
                _logger.warn(`Failed to fetch filing text from ${url}: ${response.status}`);
                return "";
            }
            const rawText = await response.text();

            // helper to strip HTML tags
            const strippedText = rawText.replace(/<[^>]*>?/gm, ' ');

            // Increase limit to 1,500,000 characters for 10-K analysis
            return strippedText.substring(0, 1500000);
        } catch (error) {
            _logger.error(`Error fetching filing text from ${url}`, error);
            return "";
        }
    }
}
