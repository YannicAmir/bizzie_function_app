import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';

const _logger = new Logger('Subscription User Service');

interface UserSubscriptionUpdate {
    isSubscribed: boolean;
    updatedAt: string;
    subscriptionExpiryDate?: string;
}

export class UserService {
    async updateSubscriptionStatus(userId: string, isSubscribed: boolean, expiryDateMs?: number): Promise<void> {
        try {
            const updateData: UserSubscriptionUpdate = {
                isSubscribed: isSubscribed,
                updatedAt: new Date().toISOString()
            };

            if (expiryDateMs) {
                updateData.subscriptionExpiryDate = new Date(expiryDateMs).toISOString();
            }

            // Using merge just in case, but usually update is fine if doc exists. 
            // set with merge=true handles case where user doc might be missing (rare but safe)
            await getFirebaseAdmin().firestore().collection('users').doc(userId).set(updateData, { merge: true });

            _logger.info(`Updated user ${userId} subscription status to ${isSubscribed}`);
        } catch (error) {
            _logger.error(`Failed to update subscription for user ${userId}`, error);
            throw error;
        }
    }
}
