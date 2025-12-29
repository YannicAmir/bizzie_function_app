import { Logger } from '../../../core/logger';
import { getFirebaseAdmin } from '../../../core/firebase';
import { FieldValue } from 'firebase-admin/firestore';

const _logger = new Logger('Subscription Sync Firestore Service');

export class FirestoreService {
    async removeStaleToken(userId: string, deviceId: string): Promise<void> {
        try {
            await getFirebaseAdmin().firestore().collection('users').doc(userId).update({
                [`fcmTokens.${deviceId}`]: FieldValue.delete()
            });
            _logger.info(`Removed stale token for device ${deviceId} on user ${userId}`);
        } catch (error) {
            _logger.error(`Failed to remove stale token for user ${userId}`, error);
        }
    }
}
