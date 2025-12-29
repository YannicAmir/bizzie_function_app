import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';
import { retry } from '../../../core/retry';

const _logger = new Logger('User Service');

export interface User {
    id: string;
    fcmToken: string;
    createdAt: string; // ISO String or Firestore Timestamp mapped to string
    isSubscribed: boolean;
}

export interface UserService {
    streamRecentFreeUsers(days: number, batchSize?: number): AsyncGenerator<User[]>;
}

export class FirebaseUserService implements UserService {

    async *streamRecentFreeUsers(days: number, batchSize: number = 100): AsyncGenerator<User[]> {
        const db = getFirebaseAdmin().firestore();
        const usersRef = db.collection('users');

        // Calculate start date (e.g., users created in last 7 days)
        // Actually, the requirements implies iterate *all* recent users to check day matches in usecase.
        // Or query specifically for specific days? UseCase says "Iterate users... Switch(days)". 
        // So we need ALL users created >= 7 days ago.

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        // Be safe, maybe look back 8 days to catch boundary conditions
        cutoffDate.setDate(cutoffDate.getDate() - 1);

        // const timestamp = admin.firestore.Timestamp.fromDate(cutoffDate); 
        // Need to import admin or use Date directly if converter handles it. 
        // Using Date directly is usually supported by Node SDK.

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
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt, // Handle Timestamp or String
                    isSubscribed: data.isSubscribed
                } as User;
            }).filter(u => u.fcmToken); // Ensure token exists

            yield users;

            lastDoc = batch.docs[batch.docs.length - 1] || null;

            // If we got fewer than batchSize, we are done
            if (batch.size < batchSize) {
                hasMore = false;
            }
        }
    }
}
