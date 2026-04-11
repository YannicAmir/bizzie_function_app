import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';

const _logger = new Logger('BizzieChat LangGraphService');

const REQUEST_TIMEOUT_MS = 90_000;
const METADATA_FETCH_TIMEOUT_MS = 2_000;
// 55-minute TTL on 1-hour GCP OIDC tokens — never serve a near-expired token
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1_000;

class HttpError extends Error {
    constructor(message: string, readonly httpStatus: number) {
        super(message);
        this.name = 'HttpError';
    }
}

export interface LangGraphInvokeRequest {
    input: Record<string, unknown>;
    thread_id: string;
}

export interface LangGraphChatOutput {
    message: string | null;
    follow_ups: string[];
    source: string | null;
    route_path: string | null;
    retry_after_seconds: number | null;
    metadata: Record<string, unknown>;
}

export interface LangGraphChatResponse {
    output: LangGraphChatOutput;
    run_id: string;
}

export type StreamEvent =
    | { type: 'token'; token: string }
    | { type: 'done'; follow_ups: string[]; source: string | null; route_path: string | null; metadata: Record<string, unknown> }
    | { type: 'error'; message: string };

interface TokenCacheEntry {
    token: string;
    expiresAt: number;
    inFlight: Promise<string> | null;
}

const _tokenCache = new Map<string, TokenCacheEntry>();

export class LangGraphService {
    constructor(private readonly serviceUrl: string) {}

    async invoke(request: LangGraphInvokeRequest): Promise<LangGraphChatResponse> {
        return retry(() => this._invokeOnce(request), {
            maxAttempts: 2,
            initialDelayMs: 2_000,
            shouldRetry: (err) => {
                if (err instanceof HttpError && err.httpStatus >= 400 && err.httpStatus < 500) return false;
                return true;
            },
        });
    }

    async *stream(request: LangGraphInvokeRequest): AsyncGenerator<StreamEvent> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        let idToken = '';
        try {
            idToken = await this._getIdToken(this.serviceUrl);
        } catch {
            // ignore — non-GCP environment
        }

        try {
            const res = await fetch(`${this.serviceUrl}/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders(idToken) },
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                await res.body?.cancel();
                _logger.error('LangGraph stream request failed', { status: res.status });
                yield { type: 'error', message: 'AI service unavailable' };
                return;
            }

            reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const { events, remainder } = this._parseSseLines(buffer);
                buffer = remainder;
                for (const event of events) {
                    yield event;
                }
            }
        } catch (err) {
            _logger.error('LangGraph stream error', err);
            yield { type: 'error', message: 'AI service unavailable' };
        } finally {
            try { reader?.releaseLock(); } catch { /* ignore */ }
            clearTimeout(timer);
        }
    }

    private async _invokeOnce(request: LangGraphInvokeRequest): Promise<LangGraphChatResponse> {
        const idToken = await this._getIdToken(this.serviceUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(`${this.serviceUrl}/invoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders(idToken) },
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            if (!res.ok) {
                const status = res.status;
                await res.body?.cancel();
                throw new HttpError('LangGraph upstream error', status);
            }
            return (await res.json()) as LangGraphChatResponse;
        } finally {
            clearTimeout(timer);
        }
    }

    private _authHeaders(idToken: string): Record<string, string> {
        return idToken ? { Authorization: `Bearer ${idToken}` } : {};
    }

    private _parseSseLines(buffer: string): { events: StreamEvent[]; remainder: string } {
        const lines = buffer.split('\n');
        const remainder = lines.pop() ?? '';
        const events: StreamEvent[] = [];
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
                events.push(JSON.parse(raw) as StreamEvent);
            } catch {
                // skip malformed SSE line
            }
        }
        return { events, remainder };
    }

    private async _getIdToken(audience: string): Promise<string> {
        const now = Date.now();
        const entry = _tokenCache.get(audience);

        if (entry?.token && now < entry.expiresAt) {
            return entry.token;
        }

        if (entry?.inFlight) {
            return entry.inFlight;
        }

        const inFlight: Promise<string> = this._fetchIdToken(audience)
            .then((token) => {
                if (token) {
                    _tokenCache.set(audience, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS, inFlight: null });
                } else {
                    const stale = _tokenCache.get(audience);
                    if (stale) _tokenCache.set(audience, { ...stale, inFlight: null });
                }
                return token;
            })
            .catch(() => {
                const stale = _tokenCache.get(audience);
                if (stale) _tokenCache.set(audience, { ...stale, inFlight: null });
                return '';
            });

        _tokenCache.set(audience, { token: entry?.token ?? '', expiresAt: entry?.expiresAt ?? 0, inFlight });
        return inFlight;
    }

    private async _fetchIdToken(audience: string): Promise<string> {
        const metadataUrl =
            `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
            `?audience=${encodeURIComponent(audience)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(metadataUrl, {
                headers: { 'Metadata-Flavor': 'Google' },
                signal: controller.signal,
            });
            return res.ok ? await res.text() : '';
        } catch {
            return '';
        } finally {
            clearTimeout(timer);
        }
    }
}
