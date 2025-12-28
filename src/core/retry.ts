import { Logger } from './logger';

const _logger = new Logger("Retry Utility");

/**
 * Options for the retry utility.
 */
export interface RetryOptions {
    /** Maximum number of attempts. Default: 3 */
    maxAttempts?: number;
    /** Initial delay in milliseconds before the first retry. Default: 1000 */
    initialDelayMs?: number;
    /** Multiplier for the delay after each retry. Default: 2 */
    backoffFactor?: number;
    /** Maximum allowable delay in milliseconds. Default: 30000 */
    maxDelayMs?: number;
    /** Optional predicate to decide if an error should be retried. Default: retry on all errors. */
    shouldRetry?: (error: unknown) => boolean;
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
    const shouldRetry = options.shouldRetry ?? (() => true); // Default to always retry

    let attempt = 1;

    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= maxAttempts) {
                // Max attempts reached, rethrow the last error
                throw error;
            }

            if (!shouldRetry(error)) {
                // Error is not retryable
                throw error;
            }

            // Calculate delay for the current attempt
            const delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), maxDelayMs);

            // Log the retry
            _logger.warn(`Operation failed (Attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`, { error: error instanceof Error ? error.message : String(error) });

            await new Promise(resolve => setTimeout(resolve, delay));

            attempt++;
        }
    }
}
