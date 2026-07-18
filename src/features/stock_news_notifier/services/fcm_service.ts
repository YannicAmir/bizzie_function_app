import { messaging } from 'firebase-admin';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';
import { NewsNotificationInput } from '../models';

const _logger = new Logger('Stock News FCM Service');

export class FcmService {

    async sendNewsNotification(input: NewsNotificationInput): Promise<void> {
        const { ticker, title, body, newsId, url, count } = input;
        const collapseId = `news_${ticker}`;

        const message: messaging.Message = {
            topic: ticker,
            notification: { title, body },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-collapse-id': collapseId,
                },
                payload: { aps: { sound: 'default' } },
            },
            android: { collapseKey: collapseId },
            data: {
                type: 'stock_news',
                ticker,
                newsId,
                url,
                count: String(count),
            },
        };

        try {
            await getFirebaseAdmin().messaging().send(message);
            _logger.info(`Sent news notification to topic ${ticker}`, { ticker, newsId, count });
        } catch (error) {
            _logger.error(`Failed to send news notification to topic ${ticker}`, error);
        }
    }
}
