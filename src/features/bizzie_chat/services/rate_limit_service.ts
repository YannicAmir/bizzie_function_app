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
     * Atomically check the rate limit and increment if allowed.
     *
     * Combines the former checkStatus + increment into a single Firestore transaction,
     * eliminating the TOCTOU race where concurrent requests could all pass the check
     * before any increment was committed.
     *
     * Returns { allowed: false } without incrementing if the limit is reached.
     * Returns { allowed: true } and writes the new timestamp if allowed.
     */
    async checkAndIncrement(uid: string, dailyLimit: number = DEFAULT_DAILY_LIMIT): Promise<RateLimitStatus> {
        const ref = getFirebaseAdmin()
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('rateLimits')
            .doc('chat');

        try {
            return await getFirebaseAdmin().firestore().runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                const now = Math.floor(Date.now() / 1000);
                const cutoff = now - WINDOW_SECONDS;

                const timestamps: number[] = doc.exists
                    ? (doc.data()!.timestamps as number[] ?? []).filter((t: number) => t > cutoff)
                    : [];

                if (timestamps.length >= dailyLimit) {
                    const oldest = Math.min(...timestamps);
                    const retryAfterSeconds = oldest + WINDOW_SECONDS - now;
                    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
                }

                // Allowed — write the new timestamp atomically in the same transaction
                tx.set(ref, { timestamps: [...timestamps, now] });
                return { allowed: true };
            });
        } catch (error) {
            _logger.error('Rate limit check failed', error);
            // Fail open: allow the request rather than block on infra error
            return { allowed: true };
        }
    }

    /**
     * Decrement the rate limit by removing the most recent timestamp.
     * Called when a request was allowed but ultimately failed (e.g. LangGraph error),
     * so the user is not penalised for an infrastructure failure.
     */
    async decrement(uid: string): Promise<void> {
        const ref = getFirebaseAdmin()
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('rateLimits')
            .doc('chat');

        try {
            await getFirebaseAdmin().firestore().runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                if (!doc.exists) return;
                const timestamps: number[] = doc.data()!.timestamps as number[] ?? [];
                if (timestamps.length === 0) return;
                // Remove the most recent entry
                const updated = [...timestamps];
                updated.splice(updated.lastIndexOf(Math.max(...updated)), 1);
                tx.set(ref, { timestamps: updated });
            });
        } catch (error) {
            _logger.error('Rate limit decrement failed', error);
        }
    }
}
