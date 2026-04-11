import { Logger } from '../../core/logger';
import { getRemoteConfig } from '../../core/remote-config';
import { AppError } from '../../core/errors';
import { AuthService } from './services/auth_service';
import { UserService } from './services/user_service';
import { RateLimitService } from './services/rate_limit_service';
import { IdempotencyService } from './services/idempotency_service';
import { ConversationService, HistoryResult } from './services/conversation_service';
import { LangGraphService, LangGraphChatResponse, StreamEvent } from './services/langgraph_service';

const STATIC_ROUTES = new Set(['exit', 'price_redirect']);

const _logger = new Logger('BizzieChat UseCase');

const MAX_QUERY_LENGTH = 500;
const MAX_COMPANY_NAME_LENGTH = 100;

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
        .replace(/[\u0000-\u001F\u007F]/g, '')
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

        if (!user) throw new AppError('User not found', 'USER_NOT_FOUND', 404);
        if (!user.isSubscribed) throw new AppError('Active subscription required', 'NOT_SUBSCRIBED', 403);
        if (user.subscriptionExpiryDate) {
            const expiry = new Date(user.subscriptionExpiryDate).getTime();
            if (Date.now() > expiry) throw new AppError('Subscription expired', 'SUBSCRIPTION_EXPIRED', 403);
        }

        const sanitizedQuery = sanitizeString(req.query, MAX_QUERY_LENGTH);
        if (!sanitizedQuery) throw new AppError('Empty query after sanitization', 'INVALID_QUERY', 400);
        if (hasInjectionPattern(sanitizedQuery)) throw new AppError('Query rejected: injection pattern detected', 'INJECTION_DETECTED', 400);
        if (!/^[A-Z]{1,5}$/.test(req.companyTicker)) throw new AppError('Invalid ticker symbol', 'INVALID_TICKER', 400);

        const sanitizedCompanyName = sanitizeString(req.companyName, MAX_COMPANY_NAME_LENGTH);
        if (!sanitizedCompanyName) throw new AppError('Invalid company name', 'INVALID_COMPANY_NAME', 400);
        if (hasInjectionPattern(sanitizedCompanyName)) throw new AppError('Company name rejected: injection pattern detected', 'INJECTION_DETECTED', 400);

        const [rateStatus, history] = await Promise.all([
            this.rateLimitService.checkAndIncrement(uid, llm_responses_per_day),
            this.conversationService.loadHistory(uid, req.sessionId),
        ]) as [Awaited<ReturnType<typeof this.rateLimitService.checkAndIncrement>>, HistoryResult];

        if (!rateStatus.allowed) {
            throw new AppError('Daily chat limit reached', 'RATE_LIMIT_EXCEEDED', 429, rateStatus.retryAfterSeconds);
        }

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

    async *executeStream(req: BizzieChatRequest, preflightResult: BizzieChatPreflight): AsyncGenerator<StreamEvent> {
        if (preflightResult.cachedResponse) {
            const cached = preflightResult.cachedResponse;
            yield { type: 'token', token: cached.message };
            yield { type: 'done', follow_ups: cached.followUps, source: cached.source, route_path: cached.metadata.routePath, metadata: {} };
            return;
        }

        const { uid, graphInput, threadId } = preflightResult;
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
                    this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
                    yield event;
                    return;
                }
            }
        } catch (error) {
            _logger.error('LangGraph stream failed', error);
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
            yield { type: 'error', message: 'AI service unavailable' };
            return;
        }

        if (!finalMessage || !doneEvent) return;

        const response = this._buildResponse(finalMessage, doneEvent.follow_ups, doneEvent.source, doneEvent.route_path, req.sessionId);
        this._persistResult(uid, req, response, preflightResult);
    }

    async execute(req: BizzieChatRequest): Promise<BizzieChatResponse> {
        const preflightResult = await this.preflight(req);

        if (preflightResult.cachedResponse) {
            return preflightResult.cachedResponse;
        }

        const { uid, graphInput, threadId } = preflightResult;

        let graphResult: LangGraphChatResponse;
        try {
            graphResult = await this.langGraphService.invoke({ input: graphInput, thread_id: threadId });
        } catch (error) {
            _logger.error('LangGraph invocation failed', error);
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
            throw new AppError('AI service unavailable', 'GRAPH_ERROR', 503);
        }

        const output = graphResult.output;
        if (!output.message) {
            _logger.warn('Graph returned empty message', { routePath: output.route_path });
            this.rateLimitService.decrement(uid).catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
            throw new AppError('No response from AI service', 'EMPTY_RESPONSE', 500);
        }

        const response = this._buildResponse(output.message, output.follow_ups ?? [], output.source, output.route_path, req.sessionId);
        this._persistResult(uid, req, response, preflightResult);
        return response;
    }

    private _buildResponse(
        message: string,
        followUps: string[],
        source: string | null,
        routePath: string | null,
        sessionId: string,
    ): BizzieChatResponse {
        return { message, followUps, source, metadata: { routePath, sessionId } };
    }

    private _persistResult(
        uid: string,
        req: BizzieChatRequest,
        response: BizzieChatResponse,
        preflight: Pick<BizzieChatPreflight, 'sanitizedQuery' | 'sanitizedCompanyName' | 'isFirstTurn'>,
    ): void {
        const routePath = response.metadata.routePath;
        const isStaticRoute = routePath != null && STATIC_ROUTES.has(routePath);

        this.idempotencyService.store(uid, req.idempotencyKey, response)
            .catch((err: unknown) => _logger.error('Idempotency store failed', err));

        if (isStaticRoute) {
            this.rateLimitService.decrement(uid)
                .catch((err: unknown) => _logger.error('Rate limit decrement failed', err));
        } else {
            this.conversationService.appendTurn({
                uid,
                sessionId: req.sessionId,
                ticker: req.companyTicker,
                companyName: preflight.sanitizedCompanyName,
                userMessage: preflight.sanitizedQuery,
                assistantMessage: response.message,
                followUps: response.followUps,
                source: response.source,
                routePath,
                isFirstTurn: preflight.isFirstTurn,
                title: preflight.sanitizedQuery.slice(0, 60),
            }).catch((err: unknown) => _logger.error('Conversation append failed', err));
        }
    }
}
