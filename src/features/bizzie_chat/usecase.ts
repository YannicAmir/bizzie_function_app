import { Logger } from '../../core/logger';
import { getRemoteConfig } from '../../core/remote-config';
import { AuthService } from './services/auth_service';
import { UserService } from './services/user_service';
import { RateLimitService } from './services/rate_limit_service';
import { IdempotencyService } from './services/idempotency_service';
import { ConversationService } from './services/conversation_service';
import { LangGraphService, LangGraphChatResponse, StreamEvent } from './services/langgraph_service';

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

export class BizzieChatUseCase {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly rateLimitService: RateLimitService,
        private readonly idempotencyService: IdempotencyService,
        private readonly conversationService: ConversationService,
        private readonly langGraphService: LangGraphService,
    ) { }

    /**
     * Shared pre-flight: auth, user checks, rate limit, conversation history.
     * Returns the validated inputs needed to call LangGraph.
     */
    private async _preflight(req: BizzieChatRequest): Promise<{
        uid: string;
        sanitizedQuery: string;
        graphInput: Record<string, unknown>;
        threadId: string;
        cachedResponse: BizzieChatResponse | null;
    }> {
        const remoteConfig = await getRemoteConfig();
        const { chat_model, chat_model_flash, chat_model_lite, llm_responses_per_day } = remoteConfig.bizzie_chat;

        const { uid } = await this.authService.verifyIdToken(req.authToken);

        const [user, idempotency] = await Promise.all([
            this.userService.getUser(uid),
            this.idempotencyService.get(uid, req.idempotencyKey),
        ]);

        if (idempotency.exists && idempotency.cachedResponse) {
            _logger.info('Returning cached idempotent response');
            return { uid, sanitizedQuery: '', graphInput: {}, threadId: '', cachedResponse: idempotency.cachedResponse as BizzieChatResponse };
        }

        if (!user) throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
        if (!user.isSubscribed) throw Object.assign(new Error('Active subscription required'), { code: 'NOT_SUBSCRIBED', status: 403 });
        if (user.subscriptionExpiryDate) {
            const expiry = new Date(user.subscriptionExpiryDate).getTime();
            if (Date.now() > expiry) throw Object.assign(new Error('Subscription expired'), { code: 'SUBSCRIPTION_EXPIRED', status: 403 });
        }

        const sanitizedQuery = sanitizeInput(req.query);
        if (!sanitizedQuery) throw Object.assign(new Error('Empty query after sanitization'), { code: 'INVALID_QUERY', status: 400 });
        if (hasInjectionPattern(sanitizedQuery)) throw Object.assign(new Error('Query rejected: injection pattern detected'), { code: 'INJECTION_DETECTED', status: 400 });
        if (!/^[A-Z]{1,5}$/.test(req.companyTicker)) throw Object.assign(new Error('Invalid ticker symbol'), { code: 'INVALID_TICKER', status: 400 });

        const [rateStatus, conversationHistory] = await Promise.all([
            this.rateLimitService.checkStatus(uid, llm_responses_per_day),
            this.conversationService.loadHistory(uid, req.companyTicker),
        ]);

        if (!rateStatus.allowed) {
            throw Object.assign(new Error('Daily chat limit reached'), { code: 'RATE_LIMIT_EXCEEDED', status: 429, retryAfterSeconds: rateStatus.retryAfterSeconds });
        }
        const threadId = `bizzie_chat_${req.sessionId}_${req.companyTicker}`;
        const graphInput = {
            uid,
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

        return { uid, sanitizedQuery, graphInput, threadId, cachedResponse: null };
    }

    /**
     * Stream tokens from the LangGraph graph. Yields SSE-ready StreamEvent objects.
     * Fires rate limit / idempotency / conversation writes on the done event.
     */
    async *executeStream(req: BizzieChatRequest): AsyncGenerator<StreamEvent> {
        const preflight = await this._preflight(req);

        if (preflight.cachedResponse) {
            const cached = preflight.cachedResponse;
            yield { type: 'token', token: cached.message };
            yield { type: 'done', follow_ups: cached.followUps, source: cached.source, route_path: cached.metadata.routePath, metadata: {} };
            return;
        }

        const { uid, sanitizedQuery, graphInput, threadId } = preflight;
        let finalMessage = '';
        let doneEvent: Extract<StreamEvent, { type: 'done' }> | null = null;

        try {
            for await (const event of this.langGraphService.stream({ input: graphInput, thread_id: threadId })) {
                if (event.type === 'token') {
                    finalMessage += event.token;
                    yield event;
                } else if (event.type === 'done') {
                    doneEvent = event;
                    yield event;
                } else {
                    yield event;
                }
            }
        } catch (error) {
            _logger.error('LangGraph stream failed', error);
            yield { type: 'error', message: 'AI service unavailable' };
            return;
        }

        if (!finalMessage || !doneEvent) return;

        const response: BizzieChatResponse = {
            message: finalMessage,
            followUps: doneEvent.follow_ups,
            source: doneEvent.source,
            metadata: { routePath: doneEvent.route_path, sessionId: req.sessionId },
        };

        this.rateLimitService.increment(uid).catch((err) => _logger.error('Rate limit increment failed', err));
        this.idempotencyService.store(uid, req.idempotencyKey, response).catch((err) => _logger.error('Idempotency store failed', err));
        this.conversationService.appendTurn(uid, req.companyTicker, sanitizedQuery, finalMessage).catch((err) => _logger.error('Conversation append failed', err));
    }

    async execute(req: BizzieChatRequest): Promise<BizzieChatResponse> {
        const preflight = await this._preflight(req);

        if (preflight.cachedResponse) {
            return preflight.cachedResponse;
        }

        const { uid, sanitizedQuery, graphInput, threadId } = preflight;

        let graphResult: LangGraphChatResponse;
        try {
            graphResult = await this.langGraphService.invoke({ input: graphInput, thread_id: threadId });
        } catch (error) {
            _logger.error('LangGraph invocation failed', error);
            throw Object.assign(new Error('AI service unavailable'), { code: 'GRAPH_ERROR', status: 503 });
        }

        const output = graphResult.output;
        if (!output.message) {
            _logger.warn('Graph returned empty message', { routePath: output.route_path });
            throw Object.assign(new Error('No response from AI service'), { code: 'EMPTY_RESPONSE', status: 500 });
        }

        const response: BizzieChatResponse = {
            message: output.message,
            followUps: output.follow_ups ?? [],
            source: output.source,
            metadata: { routePath: output.route_path, sessionId: req.sessionId },
        };

        this.rateLimitService.increment(uid).catch((err) => _logger.error('Rate limit increment failed', err));
        this.idempotencyService.store(uid, req.idempotencyKey, response).catch((err) => _logger.error('Idempotency store failed', err));
        this.conversationService.appendTurn(uid, req.companyTicker, sanitizedQuery, output.message).catch((err) => _logger.error('Conversation append failed', err));

        return response;
    }
}
