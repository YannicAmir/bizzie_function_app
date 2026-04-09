import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import { BizzieChatUseCase, BizzieChatRequest } from './usecase';
import { AuthService } from './services/auth_service';
import { UserService } from './services/user_service';
import { RateLimitService } from './services/rate_limit_service';
import { IdempotencyService } from './services/idempotency_service';
import { ConversationService } from './services/conversation_service';
import { LangGraphService } from './services/langgraph_service';

getFirebaseAdmin();

const _logger = new Logger('BizzieChat Trigger');

const langGraphUrl = defineSecret('BIZZIE_CHAT_LANGGRAPH_URL');

export const bizzieChat = onRequest(
    {
        secrets: [langGraphUrl],
        memory: '512MiB',
        timeoutSeconds: 120,
        concurrency: 20,
        cors: true,
    },
    async (request, response) => {
        if (request.method !== 'POST') {
            response.status(405).json({ error: 'Method not allowed' });
            return;
        }

        // Parse Authorization header
        const authHeader = request.headers['authorization'] ?? '';
        if (!authHeader.startsWith('Bearer ')) {
            response.status(401).json({ error: 'Missing or invalid Authorization header' });
            return;
        }
        const authToken = authHeader.slice('Bearer '.length).trim();

        // Parse body
        const body = request.body as Record<string, unknown>;
        const idempotencyKey = (body?.idempotencyKey as string) || '';
        const query = (body?.query as string) || '';
        const companyTicker = (body?.companyTicker as string) || '';
        const companyName = (body?.companyName as string) || '';
        const sessionId = (body?.sessionId as string) || '';

        if (!idempotencyKey || !query || !companyTicker || !companyName || !sessionId) {
            response.status(400).json({
                error: 'Missing required fields: idempotencyKey, query, companyTicker, companyName, sessionId',
            });
            return;
        }

        const stream = (body?.stream as boolean) === true;

        const req: BizzieChatRequest = {
            authToken,
            idempotencyKey,
            query,
            companyTicker,
            companyName,
            sessionId,
        };

        try {
            const useCase = new BizzieChatUseCase(
                new AuthService(),
                new UserService(),
                new RateLimitService(),
                new IdempotencyService(),
                new ConversationService(),
                new LangGraphService(langGraphUrl.value()),
            );

            if (stream) {
                response.setHeader('Content-Type', 'text/event-stream');
                response.setHeader('Cache-Control', 'no-cache');
                response.setHeader('Connection', 'keep-alive');
                response.flushHeaders();

                for await (const event of useCase.executeStream(req)) {
                    response.write(`data: ${JSON.stringify(event)}\n\n`);
                }
                response.end();
                return;
            }

            const result = await useCase.execute(req);
            response.status(200).json(result);
        } catch (error: unknown) {
            const err = error as { code?: string; status?: number; message?: string; retryAfterSeconds?: number };

            switch (err.code) {
                case 'USER_NOT_FOUND':
                    response.status(404).json({ error: 'User not found' });
                    break;
                case 'NOT_SUBSCRIBED':
                case 'SUBSCRIPTION_EXPIRED':
                    response.status(403).json({ error: 'Active subscription required' });
                    break;
                case 'INVALID_QUERY':
                case 'INJECTION_DETECTED':
                case 'INVALID_TICKER':
                    response.status(400).json({ error: err.message ?? 'Invalid request' });
                    break;
                case 'RATE_LIMIT_EXCEEDED':
                    response.status(429).json({
                        error: 'Daily chat limit reached',
                        retryAfterSeconds: err.retryAfterSeconds,
                    });
                    break;
                case 'GRAPH_ERROR':
                case 'EMPTY_RESPONSE':
                    response.status(503).json({ error: 'AI service temporarily unavailable' });
                    break;
                default:
                    _logger.error('Unhandled error in bizzieChat', error);
                    response.status(500).json({ error: 'Internal server error' });
            }
        }
    },
);
