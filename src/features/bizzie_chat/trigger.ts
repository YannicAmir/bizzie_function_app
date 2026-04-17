import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirebaseAdmin } from '../../core/firebase';
import { Logger } from '../../core/logger';
import { AppError } from '../../core/errors';
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
const bizzieChatSA = defineString('BIZZIE_CHAT_SERVICE_ACCOUNT');

const _authService = new AuthService();
const _userService = new UserService();
const _rateLimitService = new RateLimitService();
const _idempotencyService = new IdempotencyService();
const _conversationService = new ConversationService();

interface ParsedBody {
    idempotencyKey: string;
    query: string;
    companyTicker: string;
    companyName: string;
    sessionId: string;
    stream: boolean;
}

type BodyParseResult =
    | { ok: true; data: ParsedBody }
    | { ok: false; status: number; error: string };

function parseBody(raw: Record<string, unknown>): BodyParseResult {
    const idempotencyKey = (raw?.idempotencyKey as string) || '';
    const query = (raw?.query as string) || '';
    const companyTicker = (raw?.companyTicker as string) || '';
    const companyName = (raw?.companyName as string) || '';
    const sessionId = (raw?.sessionId as string) || '';

    if (!idempotencyKey || !query || !companyTicker || !companyName || !sessionId) {
        return { ok: false, status: 400, error: 'Missing required fields: idempotencyKey, query, companyTicker, companyName, sessionId' };
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
        return { ok: false, status: 400, error: 'Invalid sessionId: must be a UUID' };
    }

    if (idempotencyKey.length > 128) {
        return { ok: false, status: 400, error: 'Invalid idempotencyKey: exceeds maximum length' };
    }

    return {
        ok: true,
        data: {
            idempotencyKey,
            query,
            companyTicker,
            companyName,
            sessionId,
            stream: (raw?.stream as boolean) === true,
        },
    };
}


export const bizzieChat = onRequest(
    {
        secrets: [langGraphUrl],
        serviceAccount: bizzieChatSA,
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

        const authHeader = request.headers['authorization'] ?? '';
        if (!authHeader.startsWith('Bearer ')) {
            response.status(401).json({ error: 'Missing or invalid Authorization header' });
            return;
        }
        const authToken = authHeader.slice('Bearer '.length).trim();

        const parsed = parseBody(request.body as Record<string, unknown>);
        if (!parsed.ok) {
            response.status(parsed.status).json({ error: parsed.error });
            return;
        }

        const { idempotencyKey, query, companyTicker, companyName, sessionId, stream } = parsed.data;
        const req: BizzieChatRequest = { authToken, idempotencyKey, query, companyTicker, companyName, sessionId };

        const useCase = new BizzieChatUseCase(
            _authService,
            _userService,
            _rateLimitService,
            _idempotencyService,
            _conversationService,
            new LangGraphService(langGraphUrl.value()),
        );

        try {
            if (stream) {
                const preflightResult = await useCase.preflight(req);

                response.setHeader('Content-Type', 'text/event-stream');
                response.setHeader('Cache-Control', 'no-cache');
                response.setHeader('Connection', 'keep-alive');
                response.flushHeaders();

                for await (const event of useCase.executeStream(req, preflightResult)) {
                    response.write(`data: ${JSON.stringify(event)}\n\n`);
                }
                response.end();
                return;
            }

            const result = await useCase.execute(req);
            response.status(200).json(result);
        } catch (error: unknown) {
            if (!(error instanceof AppError)) {
                _logger.error('Unhandled error in bizzieChat', error);
                response.status(500).json({ error: 'Internal server error' });
                return;
            }

            switch (error.code) {
                case 'UNAUTHORIZED':
                    response.status(401).json({ error: 'Invalid or expired auth token' });
                    break;
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
                case 'INVALID_COMPANY_NAME':
                    response.status(400).json({ error: error.message ?? 'Invalid request' });
                    break;
                case 'RATE_LIMIT_EXCEEDED':
                    response.status(429).json({
                        error: 'Daily chat limit reached',
                        retryAfterSeconds: error.retryAfterSeconds,
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
