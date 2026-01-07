import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Logger } from '../../core/logger';
import { FirebaseUserService } from './services/user_service';
import { FcmNotificationService } from '../../core/services/notification_service';
import { SubscriptionDripUseCase } from './usecase';

import { RemoteConfigService } from './services/config_service';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const _logger = new Logger('Subscription Drip Trigger');

export const subscriptionDrip = onSchedule({
    schedule: 'every day 09:40',
    timeZone: 'America/New_York',
    memory: '512MiB',
    timeoutSeconds: 540,
}, async () => {
    _logger.info('Subscription Drip Triggered');

    const userService = new FirebaseUserService();
    const notificationService = new FcmNotificationService();
    const configService = new RemoteConfigService();

    const useCase = new SubscriptionDripUseCase(userService, notificationService, configService);

    try {
        await useCase.execute();
        _logger.info('Subscription Drip Completed Successfully');
    } catch (error) {
        _logger.error('Subscription Drip Failed', error);
        // We log but don't rethrow to avoid automatic retries spamming users, 
        // unless we built robust idempotency. Current design is stateless/idempotent via diff calculation,
        // so retrying IS safe, but might be annoying if partial batch succeeded. 
        // For now, fail silently after logging.
    }
});
