import { Logger } from '../../logger';
import { retry } from '../../retry';
import { RevenueCatSubscriberDTO } from './dtos';

const _logger = new Logger('RevenueCat Service');

export class RevenueCatService {
    private readonly baseUrl = 'https://api.revenuecat.com/v1/subscribers';

    constructor(private readonly apiKey: string) { }

    async isUserSubscribed(userId: string): Promise<{ active: boolean; expiryDate: string | null }> {
        _logger.debug('Starting subscription status check', { userId });

        return retry(async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(`${this.baseUrl}/${userId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'X-Platform': 'google'
                    },
                    signal: controller.signal
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        _logger.warn('User not found in RevenueCat', { userId, status: 404 });
                        return { active: false, expiryDate: null };
                    }

                    const errorBody = await response.text();
                    const isTransient = response.status >= 500 || response.status === 429;

                    _logger.warn('RevenueCat API error', {
                        userId,
                        status: response.status,
                        isTransient,
                        error: errorBody
                    });

                    if (isTransient) {
                        throw new Error(`RevenueCat API transient error (${response.status})`);
                    }
                    throw new Error(`RevenueCat API non-retryable error (${response.status})`);
                }

                const data = await response.json() as RevenueCatSubscriberDTO;
                const entitlements = data.subscriber?.entitlements || {};

                let active = false;
                let latestExpiry: string | null = null;

                for (const entitlement of Object.values(entitlements)) {
                    const isInfinite = !entitlement.expires_date;
                    if (isInfinite) {
                        active = true;
                        latestExpiry = null;
                        break;
                    }

                    const expiryDateStr = entitlement.expires_date as string;
                    const expiry = new Date(expiryDateStr);

                    if (expiry > new Date()) {
                        active = true;
                    }

                    if (!latestExpiry || expiry > new Date(latestExpiry)) {
                        latestExpiry = expiryDateStr;
                    }
                }

                _logger.debug('Subscription check complete', {
                    userId,
                    active,
                    latestExpiry,
                    entitlementCount: Object.keys(entitlements).length
                });

                return { active, expiryDate: latestExpiry };

            } catch (error) {
                const isAbort = error instanceof Error && error.name === 'AbortError';
                if (isAbort) {
                    _logger.error('RevenueCat API request timed out (10s)', { userId });
                }
                throw error;
            } finally {
                clearTimeout(timeout);
            }
        }, {
            maxAttempts: 3,
            initialDelayMs: 1000,
            shouldRetry: (err) => {
                const msg = err instanceof Error ? err.message : String(err);
                const isAbort = err instanceof Error && err.name === 'AbortError';
                return msg.includes('transient') || isAbort;
            }
        });
    }
}
