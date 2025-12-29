import { Logger } from '../../core/logger';
import { NotificationService } from '../../core/services/notification_service';

const _logger = new Logger('Bizzies Picks Notifier Usecase');

export class BizziesPicksNotifierUseCase {

    constructor(
        private notificationService: NotificationService
    ) { }

    async execute(): Promise<void> {
        _logger.info("Starting Daily Bizzie's Picks Broadcast...");

        const topic = 'premium_notifications';

        // Define message content
        // TODO: In the future, this could be dynamic based on the actual picks generated for the day.
        // For now, it's a generic "Check the app" message.
        const title = "Bizzie's picks are now available! 👀";
        const body = "See what companies, brands, and products Bizzie is researching today";

        await this.notificationService.sendTopicNotification(
            topic,
            title,
            body,
            {
                type: 'bizzies_picks_daily',
                click_action: 'FLUTTER_NOTIFICATION_CLICK' // Standard for Flutter apps
            }
        );

        _logger.info(`Broadcast sent to topic: ${topic}`);
    }
}
