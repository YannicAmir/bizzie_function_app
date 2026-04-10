import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';

const _logger = new Logger('BizzieChat LangGraphService');

const INVOKE_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 90_000;
// GCP OIDC tokens are valid for 1 hour. Cache with a 55-minute TTL so we
// never serve a near-expired token, and at most one metadata fetch per instance.
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1_000;

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

export class LangGraphService {
    // Keyed by audience (serviceUrl) so multiple instances with different URLs
    // never serve a token issued for the wrong audience.
    private static _tokenCache: Map<string, TokenCacheEntry> = new Map();

    constructor(private readonly serviceUrl: string) {}

    /**
     * Invoke the bizzie_chat LangGraph graph.
     *
     * Uses a 90s AbortController timeout and retries once on network / 5xx errors.
     * Authenticated via GCP metadata server OIDC token (service-to-service IAM).
     */
    async invoke(request: LangGraphInvokeRequest): Promise<LangGraphChatResponse> {
        return retry(
            async () => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

                try {
                    const idToken = await this._getIdToken(this.serviceUrl);

                    const res = await fetch(`${this.serviceUrl}/invoke`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                        },
                        body: JSON.stringify(request),
                        signal: controller.signal,
                    });

                    if (!res.ok) {
                        const status = res.status;
                        await res.body?.cancel();
                        throw Object.assign(new Error(`LangGraph upstream error`), { httpStatus: status });
                    }

                    return (await res.json()) as LangGraphChatResponse;
                } finally {
                    clearTimeout(timer);
                }
            },
            {
                maxAttempts: 2,
                initialDelayMs: 2_000,
                shouldRetry: (err) => {
                    const status = (err as { httpStatus?: number }).httpStatus;
                    // Never retry 4xx — only transient network errors and 5xx
                    if (status !== undefined && status >= 400 && status < 500) return false;
                    return true;
                },
            },
        );
    }

    /**
     * Stream the final_response tokens from the bizzie_chat LangGraph graph via SSE.
     * Calls /stream and yields parsed StreamEvent objects.
     * Always releases the ReadableStream reader lock in the finally block.
     */
    async *stream(request: LangGraphInvokeRequest): AsyncGenerator<StreamEvent> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

        let idToken = '';
        try {
            idToken = await this._getIdToken(this.serviceUrl);
        } catch {
            // Non-GCP environment — proceed without auth
        }

        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

        try {
            const res = await fetch(`${this.serviceUrl}/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                },
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
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;
                    try {
                        yield JSON.parse(raw) as StreamEvent;
                    } catch {
                        // malformed SSE line — skip
                    }
                }
            }
        } catch (err) {
            _logger.error('LangGraph stream error', err);
            yield { type: 'error', message: 'AI service unavailable' };
        } finally {
            // Always release the lock — prevents resource leak under high concurrency
            try { reader?.releaseLock(); } catch { /* already released */ }
            clearTimeout(timer);
        }
    }

    /**
     * Fetch a GCP OIDC ID token from the metadata server for service-to-service auth.
     *
     * Token is cached per-audience for 55 minutes (tokens valid 1 hour). All concurrent
     * requests share a single in-flight fetch promise per audience — prevents thundering
     * herd on expiry. Keyed by audience so multiple serviceUrl values never cross-pollinate.
     *
     * Returns empty string in local/non-GCP environments.
     */
    private async _getIdToken(audience: string): Promise<string> {
        const now = Date.now();
        const entry = LangGraphService._tokenCache.get(audience);

        // Serve from cache if still valid
        if (entry && entry.token && now < entry.expiresAt) {
            return entry.token;
        }

        // Deduplicate concurrent fetches — all callers for this audience await the same promise
        if (entry?.inFlight) {
            return entry.inFlight;
        }

        const inFlight = this._fetchIdToken(audience).finally(() => {
            const current = LangGraphService._tokenCache.get(audience);
            if (current) current.inFlight = null;
        });

        LangGraphService._tokenCache.set(audience, {
            token: entry?.token ?? '',
            expiresAt: entry?.expiresAt ?? 0,
            inFlight,
        });

        return inFlight;
    }

    private async _fetchIdToken(audience: string): Promise<string> {
        try {
            const metadataUrl =
                `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
                `?audience=${encodeURIComponent(audience)}`;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2_000);

            try {
                const res = await fetch(metadataUrl, {
                    headers: { 'Metadata-Flavor': 'Google' },
                    signal: controller.signal,
                });
                if (res.ok) {
                    const token = await res.text();
                    LangGraphService._tokenCache.set(audience, {
                        token,
                        expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
                        inFlight: null,
                    });
                    return token;
                }
                return '';
            } finally {
                clearTimeout(timer);
            }
        } catch {
            // Not running on GCP — skip auth header
            return '';
        }
    }
}
