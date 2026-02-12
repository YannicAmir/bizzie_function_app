import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('Subscription Cleanup Firestore Service');

export interface GhostUser {
    id: string;
    isSubscribed: boolean;
    subscriptionExpiryDate?: string;
}

export class FirestoreService {
    async getGhostSubscribers(limit: number = 50): Promise<GhostUser[]> {
        try {
            const now = new Date().toISOString();
            const snapshot = await getFirebaseAdmin().firestore()
                .collection('users')
                .where('isSubscribed', '==', true)
                .where('subscriptionExpiryDate', '<', now)
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                isSubscribed: doc.data().isSubscribed,
                subscriptionExpiryDate: doc.data().subscriptionExpiryDate
            }));
        } catch (error) {
            _logger.error('Failed to query ghost subscribers', error);
            throw error;
        }
    }

    async updateSubscriptionStatus(userId: string, isSubscribed: boolean): Promise<void> {
        try {
            await getFirebaseAdmin().firestore()
                .collection('users')
                .doc(userId)
                .update({
                    isSubscribed,
                    updatedAt: new Date().toISOString()
                });

            _logger.info(`Successfully updated user ${userId} isSubscribed to ${isSubscribed}`);
        } catch (error) {
            _logger.error(`Failed to update subscription status for user ${userId}`, error);
            throw error;
        }
    }
}
