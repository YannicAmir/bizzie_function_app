import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { AppError } from '../../../core/errors';
import { getRemoteConfig } from '../../../core/remote-config';
import { FMP_PROFILE_PATH } from '../constants';

const _logger = new Logger('NewUserWatchlistLogos/FmpProfileService');

const FMP_REQUEST_TIMEOUT_MS = 10000;

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

function isTransientError(error: unknown): boolean {
    if (error instanceof AppError) {
        return TRANSIENT_STATUSES.has(error.status);
    }
    if (error instanceof SyntaxError) {
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

type FmpProfile = Readonly<{
    symbol: string;
    image?: string;
}>;

function parseLogoUrl(raw: unknown): string | null {
    if (!Array.isArray(raw) || typeof raw[0] !== 'object' || raw[0] === null) {
        return null;
    }
    const profile = raw[0] as FmpProfile;
    return typeof profile.image === 'string' && profile.image.length > 0 ? profile.image : null;
}

export class FmpProfileService {
    private readonly cache = new Map<string, string | null>();

    constructor(private readonly apiKey: string) { }

    async fetchLogoUrl(ticker: string): Promise<string | null> {
        if (this.cache.has(ticker)) {
            return this.cache.get(ticker) ?? null;
        }

        try {
            const logoUrl = await this.requestLogoUrl(ticker);
            this.cache.set(ticker, logoUrl);
            return logoUrl;
        } catch (error) {
            _logger.error(`FMP profile lookup failed for ${ticker}`, error);
            if (!isTransientError(error)) {
                this.cache.set(ticker, null);
            }
            return null;
        }
    }

    private async requestLogoUrl(ticker: string): Promise<string | null> {
        const { fmp } = await getRemoteConfig();
        const fmpSymbol = ticker.replace(/\./g, '-');
        const url = `${fmp.baseUrl}${FMP_PROFILE_PATH}?symbol=${encodeURIComponent(fmpSymbol)}&apikey=${this.apiKey}`;

        return retry(async () => {
            const response = await fetch(url, { signal: AbortSignal.timeout(FMP_REQUEST_TIMEOUT_MS) });
            if (!response.ok) {
                throw new AppError(
                    `FMP profile fetch failed for ${ticker}: ${response.statusText}`,
                    'FMP_PROFILE_FETCH_FAILED',
                    response.status,
                );
            }
            const logoUrl = parseLogoUrl(await response.json());
            if (!logoUrl) {
                _logger.warn(`No image found in FMP profile for ${ticker}`);
            }
            return logoUrl;
        }, FMP_RETRY_OPTIONS);
    }
}
