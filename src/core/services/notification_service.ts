import { messaging } from 'firebase-admin';
import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';

export interface NotificationService {
    sendTopicNotification(topic: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
}

const _logger = new Logger('Notification Service');

export class FcmNotificationService implements NotificationService {

    async sendTopicNotification(topic: string, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
        const message: messaging.Message = {
            topic: topic,
            notification: {
                title: title,
                body: body,
            },
            data: data,
        };

        try {
            _logger.info(`Sending notification to topic: ${topic}`);
            await getFirebaseAdmin().messaging().send(message);
        } catch (error) {
            _logger.error(`Failed to send notification to topic ${topic}`, error);
            // We do not throw here to prevent one failure from stopping the entire batch
        }
    }
}
