import { Logger } from '../../core/logger';
import { getRemoteConfig } from '../../core/remote-config';
import { AuthService } from './services/auth_service';
import { UserService } from './services/user_service';
import { RateLimitService } from './services/rate_limit_service';
import { IdempotencyService } from './services/idempotency_service';
import { ConversationService, HistoryResult } from './services/conversation_service';
import { LangGraphService, LangGraphChatResponse, StreamEvent } from './services/langgraph_service';

// Static routes produce no meaningful financial content — must not consume rate limit
// slots or be stored in conversation history.
const STATIC_ROUTES = new Set(['exit', 'price_redirect']);

const _logger = new Logger('BizzieChat UseCase');

const MAX_QUERY_LENGTH = 500;
const MAX_COMPANY_NAME_LENGTH = 100;

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

function sanitizeString(raw: string, maxLength: number): string {
    return raw
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, '') // strip control characters
        .slice(0, maxLength);
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

/**
 * The validated, sanitized result of preflight checks.
 * Exported so trigger.ts can call preflight() before committing SSE headers,
 * then pass the result directly to executeStream() — ensuring auth/rate errors
 * are communicated as proper HTTP status codes, not silent empty streams.
 */
export interface BizzieChatPreflight {
    uid: string;
    sanitizedQuery: string;
    sanitizedCompanyName: string;
    graphInput: Record<string, unknown>;
    threadId: string;
    isFirstTurn: boolean;
    cachedResponse: BizzieChatResponse | null;
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
     * Validate auth, subscription, input, rate limit, and load conversation history.
     *
     * Public so trigger.ts can call it before committing SSE response headers — any
     * error thrown here is handled by the trigger's outer catch block, which can still
     * set proper HTTP status codes (401, 403, 429, etc.).
     *
     * Rate limit slot is atomically checked AND consumed here. Callers must call
     * rateLimitService.decrement(uid) if the downstream request fails or returns a
     * static route, to refund the slot.
     */
    async preflight(req: BizzieChatRequest): Promise<BizzieChatPreflight> {
        const remoteConfig = await getRemoteConfig();
        const { chat_model, chat_model_flash, chat_model_lite, llm_responses_per_day } = remoteConfig.bizzie_chat;

        const { uid } = await this.authService.verifyIdToken(req.authToken);

        const [user, idempotency] = await Promise.all([
            this.userService.getUser(uid),
            this.idempotencyService.get(uid, req.idempotencyKey),
        ]);

        if (idempotency.exists && idempotency.cachedResponse) {
            _logger.info('Returning cached idempotent response');
            return { uid, sanitizedQuery: '', sanitizedCompanyName: '', graphInput: {}, threadId: '', isFirstTurn: false, cachedResponse: idempotency.cachedResponse as BizzieChatResponse };
        }

        if (!user) throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND', status: 404 });
        if (!user.isSubscribed) throw Object.assign(new Error('Active subscription required'), { code: 'NOT_SUBSCRIBED', status: 403 });
        if (user.subscriptionExpiryDate) {
            const expiry = new Date(user.subscriptionExpiryDate).getTime();
            if (Date.now() > expiry) throw Object.assign(new Error('Subscription expired'), { code: 'SUBSCRIPTION_EXPIRED', status: 403 });
        }

        // Validate and sanitize all untrusted client input fields
        const sanitizedQuery = sanitizeString(req.query, MAX_QUERY_LENGTH);
        if (!sanitizedQuery) throw Object.assign(new Error('Empty query after sanitization'), { code: 'INVALID_QUERY', status: 400 });
        if (hasInjectionPattern(sanitizedQuery)) throw Object.assign(new Error('Query rejected: injection pattern detected'), { code: 'INJECTION_DETECTED', status: 400 });
        if (!/^[A-Z]{1,5}$/.test(req.companyTicker)) throw Object.assign(new Error('Invalid ticker symbol'), { code: 'INVALID_TICKER', status: 400 });

        // companyName is client-supplied and must be treated as untrusted
        const sanitizedCompanyName = sanitizeString(req.companyName, MAX_COMPANY_NAME_LENGTH);
        if (!sanitizedCompanyName) throw Object.assign(new Error('Invalid company name'), { code: 'INVALID_COMPANY_NAME', status: 400 });
        if (hasInjectionPattern(sanitizedCompanyName)) throw Object.assign(new Error('Company name rejected: injection pattern detected'), { code: 'INJECTION_DETECTED', status: 400 });

        // checkAndIncrement is a single atomic Firestore transaction — eliminates TOCTOU
        // race where concurrent requests could all pass the check before any write commits.
        const [rateStatus, history] = await Promise.all([
            this.rateLimitService.checkAndIncrement(uid, llm_responses_per_day),
            this.conversationService.loadHistory(uid, req.sessionId),
        ]) as [Awaited<ReturnType<typeof this.rateLimitService.checkAndIncrement>>, HistoryResult];

        if (!rateStatus.allowed) {
            throw Object.assign(new Error('Daily chat limit reached'), { code: 'RATE_LIMIT_EXCEEDED', status: 429, retryAfterSeconds: rateStatus.retryAfterSeconds });
        }

        // Only treat as first turn when we are certain the session has no history.
        // hadError=true means Firestore was unavailable — treat as continuing turn to
        // prevent overwriting an existing metadata doc.
        const isFirstTurn = !history.hadError && history.turns.length === 0;
        const threadId = `bizzie_chat_${req.sessionId}_${req.companyTicker}`;
        const graphInput = {
            uid,
            session_id: req.sessionId,
            query: sanitizedQuery,
            company_ticker: req.companyTicker,
            company_name: sanitizedCompanyName,
            investing_experience: user.investing_experience ?? 'beginner',
            conversation_history: history.turns,
            model_pro: chat_model,
            model_flash: chat_model_flash,
            model_flash_lite: chat_model_lite,
        };

        return { uid, sanitizedQuery, sanitizedCompanyName, graphInput, threadId, isFirstTurn, cachedResponse: null };
    }

    /**
     * Stream tokens from the LangGraph graph. Accepts an already-validated preflight
     * result so the caller (trigger.ts) can run preflight before committing SSE headers.
     * Rate limit slot is pre-consumed in preflight and refunded on failure or static route.
     */
    async *executeStream(req: BizzieChatRequest, preflightResult: BizzieChatPreflight): AsyncGenerator<StreamEvent> {
        if (preflightResult.cachedResponse) {
            const cached = preflightResult.cachedResponse;
            yield { type: 'token', token: cached.message };
            yield { type: 'done', follow_ups: cached.followUps, source: cached.source, route_path: cached.metadata.routePath, metadata: {} };
            return;
        }

        const { uid, sanitizedQuery, sanitizedCompanyName, graphInput, threadId, isFirstTurn } = preflightResult;
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
                } else if (event.type === 'error') {
                    // LangGraph signalled an error event (non-throw path) — refund and exit.
                    // Without this branch the loop finishes normally, the !finalMessage guard
                    // returns silently, and the rate limit slot is never refunded.
                    this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
                    yield event;
                    return;
                }
            }
        } catch (error) {
            _logger.error('LangGraph stream failed', error);
            // Refund the rate limit slot — user should not be penalised for infra failure
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
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

        const isStaticRoute = doneEvent.route_path != null && STATIC_ROUTES.has(doneEvent.route_path);

        this.idempotencyService.store(uid, req.idempotencyKey, response).catch((err: unknown) => _logger.error('Idempotency store failed', err));

        if (isStaticRoute) {
            // Refund — static responses are free and must not consume a daily slot
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
        } else {
            this.conversationService.appendTurn({
                uid,
                sessionId: req.sessionId,
                ticker: req.companyTicker,
                companyName: sanitizedCompanyName,
                userMessage: sanitizedQuery,
                assistantMessage: finalMessage,
                followUps: doneEvent.follow_ups,
                source: doneEvent.source,
                routePath: doneEvent.route_path,
                isFirstTurn,
                title: sanitizedQuery.slice(0, 60),
            }).catch((err: unknown) => _logger.error('Conversation append failed', err));
        }
    }

    async execute(req: BizzieChatRequest): Promise<BizzieChatResponse> {
        const preflightResult = await this.preflight(req);

        if (preflightResult.cachedResponse) {
            return preflightResult.cachedResponse;
        }

        const { uid, sanitizedQuery, sanitizedCompanyName, graphInput, threadId, isFirstTurn } = preflightResult;

        let graphResult: LangGraphChatResponse;
        try {
            graphResult = await this.langGraphService.invoke({ input: graphInput, thread_id: threadId });
        } catch (error) {
            _logger.error('LangGraph invocation failed', error);
            // Refund the rate limit slot — user should not be penalised for infra failure
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
            throw Object.assign(new Error('AI service unavailable'), { code: 'GRAPH_ERROR', status: 503 });
        }

        const output = graphResult.output;
        if (!output.message) {
            _logger.warn('Graph returned empty message', { routePath: output.route_path });
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
            throw Object.assign(new Error('No response from AI service'), { code: 'EMPTY_RESPONSE', status: 500 });
        }

        const response: BizzieChatResponse = {
            message: output.message,
            followUps: output.follow_ups ?? [],
            source: output.source,
            metadata: { routePath: output.route_path, sessionId: req.sessionId },
        };

        const isStaticRoute = output.route_path != null && STATIC_ROUTES.has(output.route_path);

        this.idempotencyService.store(uid, req.idempotencyKey, response).catch((err: unknown) => _logger.error('Idempotency store failed', err));

        if (isStaticRoute) {
            // Refund — static responses are free and must not consume a daily slot
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
        } else {
            this.conversationService.appendTurn({
                uid,
                sessionId: req.sessionId,
                ticker: req.companyTicker,
                companyName: sanitizedCompanyName,
                userMessage: sanitizedQuery,
                assistantMessage: output.message,
                followUps: output.follow_ups ?? [],
                source: output.source,
                routePath: output.route_path,
                isFirstTurn,
                title: sanitizedQuery.slice(0, 60),
            }).catch((err: unknown) => _logger.error('Conversation append failed', err));
        }

        return response;
    }
}
