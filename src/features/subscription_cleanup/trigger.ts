import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { Logger } from '../../core/logger';
import { FirestoreService } from './services/firestore_service';
import { RevenueCatService } from './services/revenuecat_service';
import { SubscriptionCleanupUseCase } from './usecase';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const _logger = new Logger('Subscription Cleanup Trigger');
const revenueCatApiKey = defineSecret('RC_API_KEY');

export const subscriptionCleanupTrigger = onSchedule(
    {
        schedule: 'every 4 hours',
        secrets: [revenueCatApiKey],
        memory: '256MiB',
        timeoutSeconds: 300,
        timeZone: 'UTC',
    },
    async (event) => {
        _logger.info('Scheduled subscription cleanup triggered.');

        try {
            const firestoreService = new FirestoreService();
            const revenueCatService = new RevenueCatService(revenueCatApiKey.value());
            const useCase = new SubscriptionCleanupUseCase(firestoreService, revenueCatService);

            const metrics = await useCase.execute();

            _logger.info('Successfully finished scheduled cleanup task.', {
                jobId: event.jobName,
                ...metrics
            });
        } catch (error) {
            _logger.error('Scheduled cleanup task failed with an unhandled error', error);
            throw error;
        }
    }
);
