import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Logger } from '../../core/logger';
import { FirestoreService } from '../../core/services/subscription/firestore_service';
import { RevenueCatService } from '../../core/services/subscription/revenuecat_service';
import { ManualSyncUseCase } from './usecase';

const _logger = new Logger('Manual Subscription Sync Trigger');
const RC_API_KEY = defineSecret('RC_API_KEY');

export const syncUserSubscription = onCall({
    secrets: [RC_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 30
}, async (request) => {
    if (!request.auth) {
        _logger.warn('Unauthorized sync attempt blocked.');
        throw new HttpsError('unauthenticated', 'User must be authenticated to sync subscriptions.');
    }

    const userId = request.auth.uid;

    try {
        const firestoreService = new FirestoreService();
        const revenueCatService = new RevenueCatService(RC_API_KEY.value());
        const useCase = new ManualSyncUseCase(firestoreService, revenueCatService);

        const result = await useCase.execute(userId);

        return {
            success: true,
            active: result.active,
            expiryDate: result.expiryDate
        };
    } catch (error) {
        _logger.error(`Failed to handle sync request for user ${userId}`, error);
        throw new HttpsError('internal', 'Failed to synchronize subscription status.');
    }
});
