import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { AppError } from '../../../core/errors';
import { getRemoteConfig } from '../../../core/remote-config';

const _logger = new Logger('YtdPriceSync/FmpClient');

const FMP_REQUEST_TIMEOUT_MS = 10000;

const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;

const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([
    HTTP_TOO_MANY_REQUESTS,
    HTTP_INTERNAL_SERVER_ERROR,
    HTTP_BAD_GATEWAY,
    HTTP_SERVICE_UNAVAILABLE,
    HTTP_GATEWAY_TIMEOUT,
]);

function isTransientError(err: unknown): boolean {
    if (err instanceof AppError) {
        return TRANSIENT_STATUSES.has(err.status);
    }
    if (err instanceof SyntaxError) {
        return false;
    }
    return true;
}

const FMP_RETRY_OPTIONS = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
    maxDelayMs: 30000,
    shouldRetry: isTransientError,
};

export interface FetchWindow {
    from: string;
    to: string;
}

export type FmpRowParser<T> = (item: unknown) => T | null;

export interface FmpEndpoint<T> {
    path: string;
    label: string;
    fetchFailedCode: string;
    invalidResponseCode: string;
    parseRow: FmpRowParser<T>;
}

export class FmpClient {
    constructor(private apiKey: string) { }

    async fetchWindowedRows<T>(
        endpoint: FmpEndpoint<T>,
        ticker: string,
        window: FetchWindow,
    ): Promise<T[]> {
        const { fmp } = await getRemoteConfig();
        const url = FmpClient.buildRequestUrl({
            baseUrl: fmp.baseUrl,
            path: endpoint.path,
            ticker,
            window,
            apiKey: this.apiKey,
        });

        return retry(async () => {
            const response = await fetch(url, { signal: AbortSignal.timeout(FMP_REQUEST_TIMEOUT_MS) });
            if (!response.ok) {
                throw new AppError(
                    `FMP ${endpoint.label} fetch failed for ${ticker}: ${response.statusText}`,
                    endpoint.fetchFailedCode,
                    response.status,
                );
            }

            let data: unknown;
            try {
                data = await response.json();
            } catch {
                throw new AppError(
                    `FMP ${endpoint.label} returned an unparseable response for ${ticker}`,
                    endpoint.invalidResponseCode,
                    HTTP_UNPROCESSABLE_ENTITY,
                );
            }
            if (!Array.isArray(data)) {
                throw new AppError(
                    `FMP ${endpoint.label} fetch returned a non-array response for ${ticker}`,
                    endpoint.invalidResponseCode,
                    HTTP_UNPROCESSABLE_ENTITY,
                );
            }

            return FmpClient.mapRows(endpoint, ticker, data);
        }, FMP_RETRY_OPTIONS);
    }

    private static buildRequestUrl(params: {
        baseUrl: string;
        path: string;
        ticker: string;
        window: FetchWindow;
        apiKey: string;
    }): string {
        const query = new URLSearchParams({
            symbol: params.ticker,
            from: params.window.from,
            to: params.window.to,
            apikey: params.apiKey,
        });
        return `${params.baseUrl}${params.path}?${query.toString()}`;
    }

    private static mapRows<T>(endpoint: FmpEndpoint<T>, ticker: string, rows: unknown[]): T[] {
        const parsed: T[] = [];
        let dropped = 0;

        for (const row of rows) {
            const value = endpoint.parseRow(row);
            if (!value) {
                dropped++;
                continue;
            }
            parsed.push(value);
        }

        if (dropped > 0) {
            _logger.info(`Dropped ${dropped} invalid FMP ${endpoint.label} record(s) for ${ticker}.`);
        }
        return parsed;
    }
}
