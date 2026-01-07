import { messaging } from 'firebase-admin';
import { getFirebaseAdmin } from '../firebase';
import { Logger } from '../logger';

export interface NotificationService {
    sendTopicNotification(topic: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
    sendToToken(token: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
    subscribeToTopic(tokens: string | string[], topic: string): Promise<void>;
    unsubscribeFromTopic(tokens: string | string[], topic: string): Promise<void>;
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
        }
    }

    async sendToToken(token: string, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
        const message: messaging.Message = {
            token: token,
            notification: {
                title,
                body,
            },
            data,
        };

        try {
            await getFirebaseAdmin().messaging().send(message);
        } catch (error) {
            _logger.error(`Failed to send notification to token ${token.substring(0, 10)}...`, error);
        }
    }

    async subscribeToTopic(tokens: string | string[], topic: string): Promise<void> {
        try {
            await getFirebaseAdmin().messaging().subscribeToTopic(tokens, topic);
            _logger.info(`Subscribed ${Array.isArray(tokens) ? tokens.length : 1} token(s) to topic: ${topic}`);
        } catch (error) {
            _logger.error(`Failed to subscribe to topic ${topic}`, error);
            throw error;
        }
    }

    async unsubscribeFromTopic(tokens: string | string[], topic: string): Promise<void> {
        try {
            await getFirebaseAdmin().messaging().unsubscribeFromTopic(tokens, topic);
            _logger.info(`Unsubscribed ${Array.isArray(tokens) ? tokens.length : 1} token(s) from topic: ${topic}`);
        } catch (error) {
            _logger.error(`Failed to unsubscribe from topic ${topic}`, error);
            throw error;
        }
    }
}
