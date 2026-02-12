import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('Subscription Cleanup Firestore Service');

export interface SyncUser {
    id: string;
    isSubscribed: boolean;
    subscriptionExpiryDate?: string;
}

export class FirestoreService {
    async getOutOfSyncSubscribers(limit: number = 50): Promise<SyncUser[]> {
        try {
            const now = new Date().toISOString();
            const db = getFirebaseAdmin().firestore();
            const usersRef = db.collection('users');

            const ghostTask = usersRef
                .where('isSubscribed', '==', true)
                .where('subscriptionExpiryDate', '<', now)
                .limit(limit)
                .get();

            const promoTask = usersRef
                .where('isSubscribed', '==', false)
                .where('subscriptionExpiryDate', '>', now)
                .limit(limit)
                .get();

            const [ghostSnap, promoSnap] = await Promise.all([ghostTask, promoTask]);

            const mapDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
                id: doc.id,
                isSubscribed: doc.data().isSubscribed,
                subscriptionExpiryDate: doc.data().subscriptionExpiryDate
            });

            return [...ghostSnap.docs.map(mapDoc), ...promoSnap.docs.map(mapDoc)].slice(0, limit);
        } catch (error) {
            _logger.error('Failed to query out-of-sync subscribers', error);
            throw error;
        }
    }

    async updateSubscriptionStatus(userId: string, isSubscribed: boolean, expiryDate?: string): Promise<void> {
        try {
            const updateData: {
                isSubscribed: boolean;
                updatedAt: string;
                subscriptionExpiryDate?: string;
            } = {
                isSubscribed,
                updatedAt: new Date().toISOString()
            };

            if (expiryDate) {
                updateData.subscriptionExpiryDate = expiryDate;
            }

            await getFirebaseAdmin().firestore()
                .collection('users')
                .doc(userId)
                .update(updateData);

            _logger.info(`Successfully updated user ${userId} isSubscribed to ${isSubscribed}${expiryDate ? ' and synced expiry date' : ''}`);
        } catch (error) {
            _logger.error(`Failed to update subscription status for user ${userId}`, error);
            throw error;
        }
    }
}
