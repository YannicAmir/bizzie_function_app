import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { Logger } from '../../core/logger';
import { SubscriptionWebhookUseCase, WebhookPayload } from './usecase';
import { UserService } from './services/user_service';

const _logger = new Logger("RevenueCat Webhook Trigger");

const revenueCatSecret = defineSecret('REVENUECAT_SECRET_TOKEN');

export const revenueCatWebhook = onRequest(
    {
        secrets: [revenueCatSecret],
        memory: "256MiB",
        timeoutSeconds: 60,
    },
    async (request, response) => {
        const authHeader = request.headers['authorization'] || '';
        const secretValue = revenueCatSecret.value().trim();
        const incomingAuth = authHeader.trim();

        if (!incomingAuth.includes(secretValue)) {
            _logger.warn('Unauthorized webhook attempt.', { headers: request.headers });
            response.status(403).send('Unauthorized');
            return;
        }

        const payload = request.body as WebhookPayload;

        if (!payload || !payload.event) {
            _logger.warn('Invalid payload format.');
            response.status(400).send('Invalid payload');
            return;
        }

        try {
            const userService = new UserService();
            const useCase = new SubscriptionWebhookUseCase(userService);

            await useCase.execute(payload);

            response.status(200).send('OK');
        } catch (error) {
            _logger.error('Failed to process webhook', error);
            response.status(500).send('Internal Server Error');
        }
    }
);
