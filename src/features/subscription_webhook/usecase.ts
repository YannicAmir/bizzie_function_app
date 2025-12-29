import { Logger } from '../../core/logger';
import { UserService } from './services/user_service';

const _logger = new Logger('Subscription Webhook UseCase');

// Partial Type Definition based on RevenueCat Webhook Payload
export interface RevenueCatEvent {
    type: string;
    app_user_id: string;
    expiration_at_ms?: number;
    // We can add more fields if needed
}

export interface WebhookPayload {
    event: RevenueCatEvent;
    api_version: string;
}

export class SubscriptionWebhookUseCase {
    constructor(private userService: UserService) { }

    async execute(payload: WebhookPayload): Promise<void> {
        const event = payload.event;
        const userId = event.app_user_id;

        if (!userId) {
            _logger.warn('Received webhook with no App User ID. Skipping.');
            return;
        }

        _logger.info(`Processing event ${event.type} for user ${userId}`);

        switch (event.type) {
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'UNCANCELLATION':
            case 'NON_RENEWING_PURCHASE':
                await this.userService.updateSubscriptionStatus(userId, true, event.expiration_at_ms);
                break;

            case 'CANCELLATION': // Auto-renew turned off (User still has access until expiry)
                // NOTE: RevenueCat sends CANCELLATION when auto-renew is disabled, NOT when access triggers.
                // Ideally we usually don't revoke access immediately on CANCELLATION.
                // However, for simple MVP, often "Cancellation" implies we perform some action.
                // BUT: The correct event for "Lost Access" is EXPIRATION.
                _logger.info(`User ${userId} cancelled auto-renew. Access remains until expiry.`);
                // We do NOT set isSubscribed: false here typically. 
                // We might want to set a flag "autoRenew: false" if we tracked that.
                break;

            case 'EXPIRATION':
            case 'PRODUCT_CHANGE': // Only if downgrade? Complex. Treating as potential expiry logic if needed.
                // Assuming EXPIRATION means they verified lost access.
                await this.userService.updateSubscriptionStatus(userId, false, event.expiration_at_ms);
                break;

            case 'TEST':
                _logger.info('Test event received.');
                break;

            default:
                _logger.info(`Unhandled event type: ${event.type}`);
        }
    }
}
