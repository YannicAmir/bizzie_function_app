import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat RateLimitService');

const DEFAULT_DAILY_LIMIT = 20;
const WINDOW_SECONDS = 86400; // 24 hours

export interface RateLimitStatus {
    allowed: boolean;
    retryAfterSeconds?: number;
}

export class RateLimitService {
    /**
     * Check whether the user is under the 24-hour rolling window limit.
     * Does NOT increment — call `increment()` after a successful response.
     */
    async checkStatus(uid: string, dailyLimit: number = DEFAULT_DAILY_LIMIT): Promise<RateLimitStatus> {
        try {
            const ref = getFirebaseAdmin()
                .firestore()
                .collection('users')
                .doc(uid)
                .collection('rateLimits')
                .doc('chat');

            const doc = await ref.get();
            const now = Math.floor(Date.now() / 1000);
            const cutoff = now - WINDOW_SECONDS;

            const timestamps: number[] = doc.exists
                ? (doc.data()!.timestamps as number[] ?? []).filter((t: number) => t > cutoff)
                : [];

            if (timestamps.length < dailyLimit) {
                return { allowed: true };
            }

            // Oldest entry in the window determines when the limit resets
            const oldest = Math.min(...timestamps);
            const retryAfterSeconds = oldest + WINDOW_SECONDS - now;
            return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
        } catch (error) {
            _logger.error('Rate limit check failed', error);
            // Fail open: allow the request rather than block on infra error
            return { allowed: true };
        }
    }

    /**
     * Append current timestamp to the rate limit window.
     * Prunes entries outside the 24-hour window atomically.
     */
    async increment(uid: string): Promise<void> {
        const ref = getFirebaseAdmin()
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('rateLimits')
            .doc('chat');

        const now = Math.floor(Date.now() / 1000);
        const cutoff = now - WINDOW_SECONDS;

        try {
            await getFirebaseAdmin().firestore().runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                const existing: number[] = doc.exists
                    ? (doc.data()!.timestamps as number[] ?? []).filter((t: number) => t > cutoff)
                    : [];
                tx.set(ref, { timestamps: [...existing, now] });
            });
        } catch (error) {
            // Non-critical — do not surface to caller
            _logger.error('Rate limit increment failed', error);
        }
    }
}
