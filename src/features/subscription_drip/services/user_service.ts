import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';
import { retry } from '../../../core/retry';

const _logger = new Logger('User Service');

export interface User {
    id: string;
    fcmToken: string;
    createdAt: string;
    isSubscribed: boolean;
}

export interface UserService {
    streamRecentFreeUsers(days: number, batchSize?: number): AsyncGenerator<User[]>;
}

export class FirebaseUserService implements UserService {

    async *streamRecentFreeUsers(days: number, batchSize: number = 100): AsyncGenerator<User[]> {
        const db = getFirebaseAdmin().firestore();
        const usersRef = db.collection('users');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        cutoffDate.setDate(cutoffDate.getDate() - 1);

        let lastDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
        let hasMore = true;

        _logger.info(`Streaming users created after ${cutoffDate.toISOString()}...`);

        while (hasMore) {
            const batch = await retry(async () => {
                let query = usersRef
                    .where('isSubscribed', '==', false)
                    .where('createdAt', '>=', cutoffDate)
                    .orderBy('createdAt', 'desc')
                    .limit(batchSize);

                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                const snapshot = await query.get();
                return snapshot;
            });

            if (batch.empty) {
                hasMore = false;
                break;
            }

            const users: User[] = batch.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    fcmToken: data.fcmToken,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                    isSubscribed: data.isSubscribed
                } as User;
            }).filter(u => u.fcmToken);

            yield users;

            lastDoc = batch.docs[batch.docs.length - 1] || null;

            if (batch.size < batchSize) {
                hasMore = false;
            }
        }
    }
}
