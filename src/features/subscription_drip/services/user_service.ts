import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';
import { retry } from '../../../core/retry';

const _logger = new Logger('User Service');

export interface User {
    id: string;
    fcmTokens?: Record<string, string>;
    createdAt: string;
    isSubscribed: boolean;
    notificationsEnabled?: boolean;
}

export interface UserService {
    streamRecentFreeUsers(days: number, batchSize?: number): AsyncGenerator<User[]>;
}

export class FirebaseUserService implements UserService {
    private db: FirebaseFirestore.Firestore;

    constructor(db?: FirebaseFirestore.Firestore) {
        this.db = db || getFirebaseAdmin().firestore();
    }

    async *streamRecentFreeUsers(days: number, batchSize: number = 100): AsyncGenerator<User[]> {
        const usersRef = this.db.collection('users');

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
                    fcmTokens: data.fcmTokens || {},
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                    isSubscribed: data.isSubscribed,
                    notificationsEnabled: data.notificationsEnabled
                } as User;
            });

            yield users;

            lastDoc = batch.docs[batch.docs.length - 1] || null;

            if (batch.size < batchSize) {
                hasMore = false;
            }
        }
    }
}
