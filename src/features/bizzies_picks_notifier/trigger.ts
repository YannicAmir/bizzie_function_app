import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Logger } from '../../core/logger';
import { BizziesPicksNotifierUseCase } from './usecase';
import { FcmNotificationService } from '../../core/services/notification_service';
import { getFirebaseAdmin } from '../../core/firebase';

getFirebaseAdmin();

const _logger = new Logger("Bizzies Picks Trigger");

export const bizziesPicksTrigger = onSchedule(
    {
        schedule: "every day 08:30",
        timeZone: "America/New_York",
        memory: "512MiB",
        timeoutSeconds: 60
    },
    async () => {
        _logger.info("Started");

        try {
            const notificationService = new FcmNotificationService();
            const useCase = new BizziesPicksNotifierUseCase(notificationService);

            await useCase.execute();

            _logger.info("Completed successfully");
        } catch (error) {
            _logger.error("Failed", error);
        }
    }
);
