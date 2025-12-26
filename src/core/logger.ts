import * as firebaseLogger from 'firebase-functions/logger';

/**
 * A structured logger wrapper that acts as a facade over firebase-functions/logger.
 * Automatically adds context/feature names to log messages and metadata.
 */
export class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    info(message: string, data?: any): void {
        const payload = data ? { ...data, context: this.context } : { context: this.context };
        firebaseLogger.info(`[${this.context}] ${message}`, payload);
    }

    error(message: string, error?: any): void {
        // Ensure error objects are properly serialized/attached
        const payload = error ? { error, context: this.context } : { context: this.context };
        firebaseLogger.error(`[${this.context}] ${message}`, payload);
    }

    warn(message: string, data?: any): void {
        const payload = data ? { ...data, context: this.context } : { context: this.context };
        firebaseLogger.warn(`[${this.context}] ${message}`, payload);
    }

    debug(message: string, data?: any): void {
        const payload = data ? { ...data, context: this.context } : { context: this.context };
        firebaseLogger.debug(`[${this.context}] ${message}`, payload);
    }
}
