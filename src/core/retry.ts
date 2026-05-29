import { Logger } from './logger';

const _logger = new Logger("Retry Utility");

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Retries a promise-returning function with exponential backoff.
 * 
 * @param fn The function to execute.
 * @param options Configuration options for retries.
 * @returns The result of the function `fn`.
 * @throws The last error encountered if all attempts fail.
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 3;
    const initialDelayMs = options.initialDelayMs ?? 1000;
    const backoffFactor = options.backoffFactor ?? 2;
    const maxDelayMs = options.maxDelayMs ?? 30000;
    const shouldRetry = options.shouldRetry ?? (() => true);
    const onRetry = options.onRetry;

    let attempt = 1;

    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }

            if (!shouldRetry(error)) {
                throw error;
            }

            const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), maxDelayMs);
            _logger.warn(`Operation failed (Attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`, { error: error instanceof Error ? error.message : String(error) });
            onRetry?.(attempt + 1, error);

            await new Promise(resolve => setTimeout(resolve, delay));

            attempt++;
        }
    }
}
