import { Logger } from '../../core/logger';
import { NotificationService } from '../../core/services/notification_service';
import { FirestoreService } from './services/firestore_service';

const _logger = new Logger('User Subscription Sync Usecase');

export interface User {
    id: string;
    isSubscribed: boolean;
    fcmTokens?: Record<string, string>;
}

export class UserSubscriptionSyncUseCase {

    private readonly TOPIC = 'premium_notifications';

    constructor(
        private notificationService: NotificationService,
        private firestoreService: FirestoreService
    ) { }

    async execute(before: User, after: User): Promise<void> {

        // 1. Early Exit: If no change in subscription status or tokens, return.
        if (before.isSubscribed === after.isSubscribed &&
            JSON.stringify(before.fcmTokens) === JSON.stringify(after.fcmTokens)) {
            return;
        }

        _logger.info(`Syncing subscriptions for user ${after.id}`);
        const tasks: Promise<void>[] = [];

        // 2. Collect tokens present in 'After' state
        const afterTokens = after.fcmTokens || {};
        const beforeTokens = before.fcmTokens || {};

        // 3. Logic:

        // A: User is NOW Subscribed (Active)
        if (after.isSubscribed) {
            // Subscribe all current tokens
            for (const [deviceId, token] of Object.entries(afterTokens)) {
                // Check if this token is "new" or if the user wasn't subscribed before
                const isNewToken = beforeTokens[deviceId] !== token;
                const wasNotSubscribed = !before.isSubscribed;

                if (wasNotSubscribed || isNewToken) {
                    tasks.push(this.subscribeSafe(after.id, deviceId, token));
                }
            }

            // Unsubscribe Removed Devices (Garbage Collection logic if user logged out of one device but kept other)
            // If user is still subscribed, but removed a device key, we should unsubscribe that specific old token.
            for (const [deviceId, token] of Object.entries(beforeTokens)) {
                if (!afterTokens[deviceId] || afterTokens[deviceId] !== token) {
                    // Token was removed or changed. Unsubscribe the OLD one.
                    tasks.push(this.unsubscribeSafe(token));
                }
            }

        }

        // B: User is NOW Unsubscribed (Cancelled/Expired)
        else {
            // Unsubscribe ALL tokens that were previously tracked
            // We look at 'after' tokens (if any exist) AND 'before' tokens to be safe
            const allTokens = new Set<string>([
                ...Object.values(beforeTokens),
                ...Object.values(afterTokens)
            ]);

            for (const token of allTokens) {
                tasks.push(this.unsubscribeSafe(token));
            }
        }

        await Promise.all(tasks);
    }

    private async subscribeSafe(userId: string, deviceId: string, token: string): Promise<void> {
        try {
            await this.notificationService.subscribeToTopic(token, this.TOPIC);
        } catch (error: unknown) {
            // 4. Stale Token Cleanup
            if (this.isStaleTokenError(error)) {
                _logger.info(`Token ${token.substring(0, 6)}... is stale. Removing.`);
                await this.firestoreService.removeStaleToken(userId, deviceId);
            }
        }
    }

    private async unsubscribeSafe(token: string): Promise<void> {
        try {
            await this.notificationService.unsubscribeFromTopic(token, this.TOPIC);
        } catch (error: unknown) {
            // If unsubscribe fails (e.g. invalid token), it's fine, we treat it as done.
            _logger.warn(`Failed to unsubscribe token ${token.substring(0, 6)}...`, { error });
        }
    }

    private isStaleTokenError(error: unknown): boolean {
        // Firebase error codes for invalid tokens
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
