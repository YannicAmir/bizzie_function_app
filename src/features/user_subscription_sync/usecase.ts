import { Logger } from '../../core/logger';
import { NotificationService } from '../../core/services/notification_service';
import { FirestoreService } from './services/firestore_service';
import { isEqual } from 'lodash';

const _logger = new Logger('User Subscription Sync Usecase');

export interface User {
    id: string;
    isSubscribed: boolean;
    fcmTokens?: Record<string, string>;
}

export class UserSubscriptionSyncUseCase {

    private readonly PREMIUM_TOPIC = 'premium_notifications';
    private readonly BASIC_TOPIC = 'basic_notifications';

    constructor(
        private notificationService: NotificationService,
        private firestoreService: FirestoreService
    ) { }

    async cleanupUser(user: User): Promise<void> {
        _logger.info(`Cleaning up subscriptions for deleted user ${user.id}`);
        const tasks: Promise<void>[] = [];
        const tokens = user.fcmTokens || {};

        for (const token of Object.values(tokens)) {
            tasks.push(this.unsubscribeSafe(token, this.PREMIUM_TOPIC));
            tasks.push(this.unsubscribeSafe(token, this.BASIC_TOPIC));
        }

        await Promise.all(tasks);
    }

    async execute(before: User, after: User): Promise<void> {

        if (before.isSubscribed === after.isSubscribed &&
            isEqual(before.fcmTokens, after.fcmTokens)) {
            return;
        }

        _logger.info(`Syncing subscriptions for user ${after.id}`);
        const tasks: Promise<void>[] = [];

        const afterTokens = after.fcmTokens || {};
        const beforeTokens = before.fcmTokens || {};

        const targetTopic = after.isSubscribed ? this.PREMIUM_TOPIC : this.BASIC_TOPIC;
        const oldTopic = after.isSubscribed ? this.BASIC_TOPIC : this.PREMIUM_TOPIC;

        for (const [deviceId, token] of Object.entries(afterTokens)) {
            const isNewToken = beforeTokens[deviceId] !== token;
            const statusChanged = before.isSubscribed !== after.isSubscribed;
            if (isNewToken || statusChanged) {
                tasks.push(this.subscribeSafe(after.id, deviceId, token, targetTopic));
            }

            if (statusChanged) {
                tasks.push(this.unsubscribeSafe(token, oldTopic));
            }
        }

        for (const [deviceId, token] of Object.entries(beforeTokens)) {
            if (!afterTokens[deviceId] || afterTokens[deviceId] !== token) {
                tasks.push(this.unsubscribeSafe(token, this.PREMIUM_TOPIC));
                tasks.push(this.unsubscribeSafe(token, this.BASIC_TOPIC));
            }
        }

        await Promise.all(tasks);
    }

    private async subscribeSafe(userId: string, deviceId: string, token: string, topic: string): Promise<void> {
        try {
            await this.notificationService.subscribeToTopic(token, topic);
        } catch (error: unknown) {
            if (this.isStaleTokenError(error)) {
                _logger.info(`Token ${token.substring(0, 6)}... is stale. Removing.`);
                await this.firestoreService.removeStaleToken(userId, deviceId);
            }
        }
    }

    private async unsubscribeSafe(token: string, topic: string): Promise<void> {
        try {
            await this.notificationService.unsubscribeFromTopic(token, topic);
        } catch (error: unknown) {
            _logger.warn(`Failed to unsubscribe token ${token.substring(0, 6)}... from ${topic}`, { error });
        }
    }

    private isStaleTokenError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;

        const err = error as Record<string, unknown>;
        const code = typeof err.code === 'string' ? err.code : '';
        const message = typeof err.message === 'string' ? err.message : '';

        return (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument' ||
            message.includes('NOT_FOUND') ||
            message.includes('is not a valid FCM registration token')
        );
    }
}
