import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat IdempotencyService');

// Keys expire after 24 hours (seconds)
const TTL_SECONDS = 86400;

export interface IdempotencyRecord {
    exists: boolean;
    cachedResponse?: object;
}

export class IdempotencyService {
    /**
     * Check whether an idempotency key has already been used.
     * Returns the cached response if the key exists and has not expired.
     */
    async get(uid: string, key: string): Promise<IdempotencyRecord> {
        try {
            const ref = getFirebaseAdmin()
                .firestore()
                .collection('users')
                .doc(uid)
                .collection('responseCache')
                .doc(key);

            const doc = await ref.get();
            if (!doc.exists) {
                return { exists: false };
            }

            const data = doc.data()!;
            const createdAt: number = data.createdAt ?? 0;
            const now = Math.floor(Date.now() / 1000);

            if (now - createdAt > TTL_SECONDS) {
                // Expired — treat as not existing (stale cleanup is fire-and-forget)
                ref.delete().catch(() => undefined);
                return { exists: false };
            }

            return { exists: true, cachedResponse: data.response };
        } catch (error) {
            _logger.error('Idempotency check failed', error);
            return { exists: false };
        }
    }

    /**
     * Store the response for an idempotency key.
     * Fire-and-forget — caller must not await for the response path.
     */
    async store(uid: string, key: string, response: object): Promise<void> {
        try {
            await getFirebaseAdmin()
                .firestore()
                .collection('users')
                .doc(uid)
                .collection('responseCache')
                .doc(key)
                .set({
                    response,
                    createdAt: Math.floor(Date.now() / 1000),
                });
        } catch (error) {
            _logger.error('Idempotency store failed', error);
        }
    }
}
