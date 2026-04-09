import { retry } from '../../../core/retry';

const INVOKE_TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 90_000;

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

export class LangGraphService {
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
                        const text = await res.text().catch(() => '');
                        throw new Error(`LangGraph HTTP ${res.status}: ${text}`);
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
                    // Retry on network errors and 5xx only — never retry 4xx
                    if (err instanceof Error && err.message.includes('HTTP 4')) {
                        return false;
                    }
                    return true;
                },
            },
        );
    }

    /**
     * Stream the final_response tokens from the bizzie_chat LangGraph graph via SSE.
     * Calls /stream and yields parsed StreamEvent objects.
     * On network / 5xx errors, yields a single error event.
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
                const text = await res.text().catch(() => '');
                yield { type: 'error', message: `LangGraph HTTP ${res.status}: ${text}` };
                return;
            }

            const reader = res.body.getReader();
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
            yield { type: 'error', message: err instanceof Error ? err.message : 'Stream error' };
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Fetch a GCP OIDC ID token from the metadata server for service-to-service auth.
     * Returns empty string in local/non-GCP environments where the metadata server
     * is unavailable — the Cloud Run service must be configured to allow unauthenticated
     * requests in that case.
     */
    private async _getIdToken(audience: string): Promise<string> {
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
                    return await res.text();
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
