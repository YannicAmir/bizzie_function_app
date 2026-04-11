import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat RateLimitService');

const DEFAULT_DAILY_LIMIT = 20;
const WINDOW_SECONDS = 24 * 60 * 60;

export interface RateLimitStatus {
    allowed: boolean;
    retryAfterSeconds?: number;
}

export class RateLimitService {
    async checkAndIncrement(uid: string, dailyLimit: number = DEFAULT_DAILY_LIMIT): Promise<RateLimitStatus> {
        const db = getFirebaseAdmin().firestore();
        const ref = this._rateLimitRef(uid);

        try {
            return await db.runTransaction(async (tx) => {
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

                tx.set(ref, { timestamps: [...timestamps, now] });
                return { allowed: true };
            });
        } catch (error) {
            _logger.error('Rate limit check failed', error);
            return { allowed: true };
        }
    }

    /** Called when a request was allowed but ultimately failed so the user is not penalised for an infrastructure failure. */
    async decrement(uid: string): Promise<void> {
        const db = getFirebaseAdmin().firestore();
        const ref = this._rateLimitRef(uid);

        try {
            await db.runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                if (!doc.exists) return;
                const timestamps: number[] = doc.data()!.timestamps as number[] ?? [];
                if (timestamps.length === 0) return;
                const updated = [...timestamps];
                updated.splice(updated.lastIndexOf(Math.max(...updated)), 1);
                tx.set(ref, { timestamps: updated });
            });
        } catch (error) {
            _logger.error('Rate limit decrement failed', error);
        }
    }

    private _rateLimitRef(uid: string) {
        return getFirebaseAdmin()
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('rateLimits')
            .doc('chat');
    }
}
