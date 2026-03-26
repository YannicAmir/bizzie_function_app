import { Logger } from '../../core/logger';
import { getRemoteConfig } from '../../core/remote-config';
import { AuthService } from './services/auth_service';
import { UserService } from './services/user_service';
import { RateLimitService } from './services/rate_limit_service';
import { IdempotencyService } from './services/idempotency_service';
import { ConversationService } from './services/conversation_service';
import { LangGraphService, LangGraphChatResponse } from './services/langgraph_service';

const _logger = new Logger('BizzieChat UseCase');

// Input sanitization

const MAX_QUERY_LENGTH = 500;

// Patterns that indicate prompt injection or jailbreak attempts (case-insensitive)
const INJECTION_PATTERNS: readonly RegExp[] = [
    /ignore (previous|all|prior) instructions/i,
    /disregard (previous|all|prior)/i,
    /you are now/i,
    /act as (a|an|if)/i,
    /pretend (you are|to be)/i,
    /forget (your|all|previous)/i,
    /system prompt/i,
    /\[INST\]/i,
    /<\|im_start\|>/i,
    /###\s*instruction/i,
    /new persona/i,
    /jailbreak/i,
    /DAN mode/i,
];

function sanitizeInput(raw: string): string {
    return raw
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, '') // strip control characters
        .slice(0, MAX_QUERY_LENGTH);
}

function hasInjectionPattern(text: string): boolean {
    return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// Request / response types

export interface BizzieChatRequest {
    authToken: string;
    idempotencyKey: string;
    query: string;
    companyTicker: string;
    companyName: string;
    sessionId: string;
}

export interface BizzieChatResponse {
    message: string;
    followUps: string[];
    source: string | null;
    metadata: {
        routePath: string | null;
        sessionId: string;
    };
}

// Use case

export class BizzieChatUseCase {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly rateLimitService: RateLimitService,
        private readonly idempotencyService: IdempotencyService,
        private readonly conversationService: ConversationService,
        private readonly langGraphService: LangGraphService,
    ) { }

    async execute(req: BizzieChatRequest): Promise<BizzieChatResponse> {
        // Step 0: Fetch Remote Config (cached)
        const remoteConfig = await getRemoteConfig();
        const { chat_model, chat_model_flash, chat_model_lite, llm_responses_per_day } = remoteConfig.bizzie_chat;

        // Step 1: Verify Firebase ID token
        const { uid } = await this.authService.verifyIdToken(req.authToken);

        // Step 2: Parallel fetch — user doc + idempotency check
        const [user, idempotency] = await Promise.all([
            this.userService.getUser(uid),
            this.idempotencyService.get(uid, req.idempotencyKey),
        ]);

        // Step 3: Return cached response for duplicate requests
        if (idempotency.exists && idempotency.cachedResponse) {
            _logger.info('Returning cached idempotent response');
            return idempotency.cachedResponse as BizzieChatResponse;
        }

        // Step 4: User existence check
        if (!user) {
            throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
        }

        // Step 5: Primary subscription check
        if (!user.isSubscribed) {
            throw Object.assign(new Error('Active subscription required'), {
                code: 'NOT_SUBSCRIBED',
                status: 403,
            });
        }

        // Step 6: Secondary subscription expiry check
        if (user.subscriptionExpiryDate) {
            const expiry = new Date(user.subscriptionExpiryDate).getTime();
            if (Date.now() > expiry) {
                throw Object.assign(new Error('Subscription expired'), {
                    code: 'SUBSCRIPTION_EXPIRED',
                    status: 403,
                });
            }
        }

        // Step 7: Input sanitization
        const sanitizedQuery = sanitizeInput(req.query);
        if (!sanitizedQuery) {
            throw Object.assign(new Error('Empty query after sanitization'), {
                code: 'INVALID_QUERY',
                status: 400,
            });
        }

        // Step 8: Injection / jailbreak scan
        if (hasInjectionPattern(sanitizedQuery)) {
            throw Object.assign(new Error('Query rejected: injection pattern detected'), {
                code: 'INJECTION_DETECTED',
                status: 400,
            });
        }

        // Step 9: Ticker validation
        if (!/^[A-Z]{1,5}$/.test(req.companyTicker)) {
            throw Object.assign(new Error('Invalid ticker symbol'), {
                code: 'INVALID_TICKER',
                status: 400,
            });
        }

        // Step 10: Rate limit check
        const rateStatus = await this.rateLimitService.checkStatus(uid, llm_responses_per_day);
        if (!rateStatus.allowed) {
            throw Object.assign(
                new Error('Daily chat limit reached'),
                {
                    code: 'RATE_LIMIT_EXCEEDED',
                    status: 429,
                    retryAfterSeconds: rateStatus.retryAfterSeconds,
                },
            );
        }

        // Step 11: Load conversation history
        const conversationHistory = await this.conversationService.loadHistory(
            uid,
            req.companyTicker,
        );

        // Step 12: Build thread_id + invoke LangGraph
        const threadId = `bizzie_chat_${req.sessionId}_${req.companyTicker}`;
        const graphInput = {
            uid, // passed to Python but never into LLM prompts
            session_id: req.sessionId,
            query: sanitizedQuery,
            company_ticker: req.companyTicker,
            company_name: req.companyName,
            investing_experience: user.investing_experience ?? 'beginner',
            conversation_history: conversationHistory,
            model_pro: chat_model,
            model_flash: chat_model_flash,
            model_flash_lite: chat_model_lite,
        };

        let graphResult: LangGraphChatResponse;
        try {
            graphResult = await this.langGraphService.invoke({
                input: graphInput,
                thread_id: threadId,
            });
        } catch (error) {
            _logger.error('LangGraph invocation failed', error);
            throw Object.assign(new Error('AI service unavailable'), {
                code: 'GRAPH_ERROR',
                status: 503,
            });
        }

        // Step 13: Assemble response
        const output = graphResult.output;

        if (!output.message) {
            _logger.warn('Graph returned empty message', { routePath: output.route_path });
            throw Object.assign(new Error('No response from AI service'), {
                code: 'EMPTY_RESPONSE',
                status: 500,
            });
        }

        const response: BizzieChatResponse = {
            message: output.message,
            followUps: output.follow_ups ?? [],
            source: output.source,
            metadata: {
                routePath: output.route_path,
                sessionId: req.sessionId,
            },
        };

        // Fire-and-forget: rate limit, idempotency, history
        this.rateLimitService.increment(uid).catch((err) =>
            _logger.error('Rate limit increment failed', err),
        );
        this.idempotencyService.store(uid, req.idempotencyKey, response).catch((err) =>
            _logger.error('Idempotency store failed', err),
        );
        this.conversationService
            .appendTurn(uid, req.companyTicker, sanitizedQuery, output.message)
            .catch((err) => _logger.error('Conversation append failed', err));

        return response;
    }
}
