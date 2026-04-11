import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat IdempotencyService');

const TTL_SECONDS = 24 * 60 * 60;

export interface IdempotencyRecord {
    exists: boolean;
    cachedResponse?: object;
}

export class IdempotencyService {
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
                ref.delete().catch(() => undefined);
                return { exists: false };
            }

            return { exists: true, cachedResponse: data.response };
        } catch (error) {
            _logger.error('Idempotency check failed', error);
            return { exists: false };
        }
    }

    /** Fire-and-forget — do not await. */
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
