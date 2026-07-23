import { Logger } from '../logger';
import { retry } from '../retry';
import { getRemoteConfig } from '../remote-config';
import { emitMetric } from '../metrics';
import { CircuitBreaker } from '../circuit_breaker';

const _logger = new Logger('SEC Service');

export type SecFormType = '10-K' | '10-Q' | '8-K';

export const FORM_TYPE_10K = '10-K' as const;
export const FORM_TYPE_10Q = '10-Q' as const;
export const FORM_TYPE_8K = '8-K' as const;

export interface SecFiling {
    symbol: string;
    filingDate: string;
    acceptedDate: string;
    period?: string;
    formType: string;
    link: string;
    finalLink: string;
    cik: string;
}

export interface GetFilingsRequest {
    type: SecFormType;
    startDate: string;
    endDate: string;
    sinceAcceptedDate?: string;
}

/**
 * Outcome of fetching a filing's text. Callers must distinguish these:
 * - `ok`          — text was retrieved; safe to analyze.
 * - `empty`       — retrieved successfully but the document has no text; do NOT retry.
 * - `unavailable` — the fetch never succeeded (circuit open, network error, or
 *                   non-OK status); the caller may retry later.
 */
export type FilingTextResult =
    | { status: 'ok'; text: string }
    | { status: 'empty' }
    | { status: 'unavailable' };

export interface SecService {
    getFilings(request: GetFilingsRequest): Promise<SecFiling[]>;
    getFilingText(url: string): Promise<FilingTextResult>;
}

export class FmpSecService implements SecService {
    private static readonly PAGE_SIZE = 1000;
    private static readonly PAGE_SAFETY_CAP = 50;
    private static readonly MAX_FILING_TEXT_CHARS = 1_500_000;
    private static readonly RATE_LIMIT_STATUSES = [429, 503, 403];
    private static readonly SERVER_ERROR_MIN_STATUS = 500;
    private static readonly secBreaker = new CircuitBreaker({
        name: 'sec_edgar',
        failureThreshold: 5,
        cooldownMs: 120_000,
    });

    constructor(private apiKey: string) { }

    async getFilings(request: GetFilingsRequest): Promise<SecFiling[]> {
        const { type, startDate, endDate, sinceAcceptedDate } = request;
        const results: SecFiling[] = [];
        let page = 0;
        let keepFetching = true;

        _logger.info(`Fetching ${type} filings from ${startDate} to ${endDate}...`);

        while (keepFetching) {
            const pageResults = await this.fetchFilingsPage(request, page);
            const { kept, boundaryCrossed } = this.applyWatermark(pageResults, sinceAcceptedDate);

            if (kept.length > 0) {
                results.push(...kept);
                _logger.info(`Page ${page}: kept ${kept.length}/${pageResults.length} filings.`);
            }

            if (boundaryCrossed || pageResults.length < FmpSecService.PAGE_SIZE) {
                keepFetching = false;
            } else {
                page++;
                if (this.shouldStopAtCap(page, type)) {
                    keepFetching = false;
                }
            }
        }

        _logger.info(`Total ${type} filings fetched: ${results.length}`);
        return results;
    }

    private shouldStopAtCap(page: number, type: SecFormType): boolean {
        if (page < FmpSecService.PAGE_SAFETY_CAP) {
            return false;
        }
        _logger.error(`Hit page safety cap (${FmpSecService.PAGE_SAFETY_CAP}) for ${type}. Newer filings are unaffected (results are latest-first); older in-window filings were not scanned.`);
        emitMetric('sec_filings_page_cap_hit', { formType: type, pages: page });
        return true;
    }

    private fetchFilingsPage(request: GetFilingsRequest, page: number): Promise<SecFiling[]> {
        return retry(async () => {
            const config = await getRemoteConfig();
            const url = this.buildFilingsUrl(request, page, config.fmp.baseUrl);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`FMP API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!Array.isArray(data)) {
                _logger.error("API returned non-array:", data);
                return [];
            }

            return data
                .map(row => this.parseFiling(row))
                .filter((filing): filing is SecFiling => filing !== null);
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            backoffFactor: 2
        });
    }

    private buildFilingsUrl(request: GetFilingsRequest, page: number, baseUrl: string): string {
        const { type, startDate, endDate } = request;
        const paging = `from=${startDate}&to=${endDate}&page=${page}&limit=${FmpSecService.PAGE_SIZE}&apikey=${this.apiKey}`;
        return type === '8-K'
            ? `${baseUrl}/sec-filings-8k?${paging}`
            : `${baseUrl}/sec-filings-search/form-type?formType=${type}&${paging}`;
    }

    /**
     * Validates a raw FMP row at the boundary before it enters the domain.
     * Rows missing a required string field are dropped (logged) rather than
     * flowing downstream as filings with `undefined` fields.
     */
    private parseFiling(raw: unknown): SecFiling | null {
        if (typeof raw !== 'object' || raw === null) {
            _logger.warn('Skipping non-object SEC filing row from FMP', { raw });
            return null;
        }

        const row = raw as Record<string, unknown>;
        const requiredFields = ['symbol', 'filingDate', 'acceptedDate', 'formType', 'link', 'finalLink', 'cik'] as const;
        for (const field of requiredFields) {
            if (typeof row[field] !== 'string') {
                _logger.warn(`Skipping SEC filing row missing string field '${field}'`, { raw });
                return null;
            }
        }

        const filing: SecFiling = {
            symbol: row.symbol as string,
            filingDate: row.filingDate as string,
            acceptedDate: row.acceptedDate as string,
            formType: row.formType as string,
            link: row.link as string,
            finalLink: row.finalLink as string,
            cik: row.cik as string
        };

        if (typeof row.period === 'string') {
            filing.period = row.period;
        }

        return filing;
    }

    private applyWatermark(pageResults: SecFiling[], sinceAcceptedDate?: string): { kept: SecFiling[]; boundaryCrossed: boolean } {
        if (!sinceAcceptedDate) {
            return { kept: pageResults, boundaryCrossed: false };
        }

        const boundaryCrossed = pageResults.some(f => f.acceptedDate && f.acceptedDate < sinceAcceptedDate);
        const kept = pageResults.filter(f => !f.acceptedDate || f.acceptedDate >= sinceAcceptedDate);
        return { kept, boundaryCrossed };
    }

    async getFilingText(url: string): Promise<FilingTextResult> {
        if (!FmpSecService.secBreaker.tryAcquire()) {
            _logger.warn(`SEC circuit open; skipping fetch for ${url}`);
            emitMetric('sec_fetch_short_circuited', { host: 'sec.gov' });
            return { status: 'unavailable' };
        }

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'BizzieApp/1.0 (yannic@getbizzie.io)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!response.ok) {
                this.handleFetchFailure(response, url);
                return { status: 'unavailable' };
            }

            FmpSecService.secBreaker.recordSuccess();
            const text = this.stripAndTruncate(await response.text());
            return text.trim().length === 0 ? { status: 'empty' } : { status: 'ok', text };
        } catch (error) {
            FmpSecService.secBreaker.recordFailure();
            _logger.error(`Error fetching filing text from ${url}`, error);
            return { status: 'unavailable' };
        }
    }

    private handleFetchFailure(response: Response, url: string): void {
        if (FmpSecService.RATE_LIMIT_STATUSES.includes(response.status)) {
            const retryAfterMs = this.parseRetryAfterMs(response.headers.get('retry-after'));
            FmpSecService.secBreaker.recordFailure(Date.now(), retryAfterMs);
            emitMetric('sec_fetch_rate_limited', { status: response.status });
        } else if (response.status >= FmpSecService.SERVER_ERROR_MIN_STATUS) {
            FmpSecService.secBreaker.recordFailure(Date.now());
        }
        _logger.warn(`Failed to fetch filing text from ${url}: ${response.status}`);
    }

    private stripAndTruncate(rawText: string): string {
        const strippedText = rawText.replace(/<[^>]*>?/gm, ' ');
        return strippedText.substring(0, FmpSecService.MAX_FILING_TEXT_CHARS);
    }

    private parseRetryAfterMs(headerValue: string | null): number {
        if (!headerValue) return 0;
        const seconds = Number(headerValue);
        if (Number.isFinite(seconds)) {
            return seconds * 1000;
        }
        const dateMs = Date.parse(headerValue);
        return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
    }
}
