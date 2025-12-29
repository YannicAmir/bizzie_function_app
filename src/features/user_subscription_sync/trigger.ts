import { onDocumentWritten, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { Logger } from '../../core/logger';
import { UserSubscriptionSyncUseCase, User } from './usecase';
import { FcmNotificationService } from '../../core/services/notification_service';
import { FirestoreService } from './services/firestore_service';

const _logger = new Logger("User Subscription Sync Trigger");

export const userSubscriptionSyncTrigger = onDocumentWritten(
    "users/{userId}",
    async (event) => {
        // _logger.info("Triggered");

        if (!event.data) {
            return;
        }

        // 1. Skip Deletions (Handled by userDeletionCleanup)
        if (!event.data.after.exists) {
            return;
        }

        // 2. Extract Data (Handle Creation where before is undefined)
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();

        // Map Firestore data to User Entity
        const beforeUser: User = {
            id: event.params.userId,
            isSubscribed: !!beforeData?.isSubscribed,
            fcmTokens: beforeData?.fcmTokens || {}
        };

        const afterUser: User = {
            id: event.params.userId,
            isSubscribed: !!afterData!.isSubscribed,
            fcmTokens: afterData!.fcmTokens || {}
        };

        try {
            const notificationService = new FcmNotificationService();
            const firestoreService = new FirestoreService();
            const useCase = new UserSubscriptionSyncUseCase(notificationService, firestoreService);

            await useCase.execute(beforeUser, afterUser);

        } catch (error) {
            _logger.error("Failed", error);
        }
    }
);

export const userDeletionCleanup = onDocumentDeleted(
    "users/{userId}",
    async (event) => {
        if (!event.data) {
            return;
        }

        const deletedData = event.data.data();
        if (!deletedData) {
            return;
        }

        const deletedUser: User = {
            id: event.params.userId,
            isSubscribed: !!deletedData.isSubscribed,
            fcmTokens: deletedData.fcmTokens || {}
        };

        try {
            const notificationService = new FcmNotificationService();
            const firestoreService = new FirestoreService();
            const useCase = new UserSubscriptionSyncUseCase(notificationService, firestoreService);

            await useCase.cleanupUser(deletedUser);
        } catch (error) {
            _logger.error("Failed to cleanup deleted user", error);
        }
    }
);
