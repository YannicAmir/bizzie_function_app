import { Logger } from '../../core/logger';
import { UserService } from './services/user_service';
import { NotificationService } from '../../core/services/notification_service';
import { ConfigService } from './services/config_service';

const _logger = new Logger('Subscription Drip Usecase');

export class SubscriptionDripUseCase {

    constructor(
        private userService: UserService,
        private notificationService: NotificationService,
        private configService: ConfigService
    ) { }

    async execute(): Promise<void> {
        _logger.info('Starting Subscription Drip cycle...');

        const campaign = await this.configService.getDripCampaign();

        const userStream = this.userService.streamRecentFreeUsers(8);

        let processedCount = 0;
        let sentCount = 0;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        for await (const batch of userStream) {
            _logger.info(`Processing batch of ${batch.length} users...`);

            for (const user of batch) {
                processedCount++;

                if (user.notificationsEnabled === false) continue; // Privacy Check

                const createdDate = new Date(user.createdAt);
                createdDate.setHours(0, 0, 0, 0);

                const diffTime = now.getTime() - createdDate.getTime();
                const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                const message = campaign[daysDiff];

                if (message && message.title && message.body) {
                    const tokens = Object.values(user.fcmTokens || {});
                    const uniqueTokens = [...new Set(tokens)];

                    for (const token of uniqueTokens) {
                        await this.notificationService.sendToToken(
                            token,
                            message.title,
                            message.body,
                            { type: 'subscription_drip', daysSinceSignup: daysDiff.toString() }
                        );
                    }
                    if (uniqueTokens.length > 0) {
                        sentCount++;
                    }
                }
            }
        }

        _logger.info(`Drip cycle complete. Processed ${processedCount} users. Sent ${sentCount} notifications.`);
    }
}
