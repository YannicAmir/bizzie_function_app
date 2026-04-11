import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat UserService');

export interface BizzieUser {
    uid: string;
    isSubscribed: boolean;
    subscriptionExpiryDate?: string;
    investing_experience?: string;
}

export class UserService {
    async getUser(uid: string): Promise<BizzieUser | null> {
        try {
            const doc = await getFirebaseAdmin().firestore().collection('users').doc(uid).get();
            if (!doc.exists) {
                return null;
            }
            const data = doc.data()!;
            return {
                uid,
                isSubscribed: data.isSubscribed === true,
                subscriptionExpiryDate: data.subscriptionExpiryDate,
                investing_experience: data.investingExperience ?? 'beginner',
            };
        } catch (error) {
            _logger.error('Failed to fetch user', error);
            throw error;
        }
    }
}
