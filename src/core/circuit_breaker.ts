import { Logger } from './logger';
import { emitMetric } from './metrics';

const CIRCUIT_BREAKER_STATE_METRIC = 'circuit_breaker_state';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
    name: string;
    failureThreshold: number;
    cooldownMs: number;
}

export class CircuitBreaker {
    private state: CircuitState = 'closed';
    private consecutiveFailures = 0;
    private openUntil = 0;
    private readonly logger: Logger;

    constructor(private readonly options: CircuitBreakerOptions) {
        if (options.failureThreshold < 1) {
            throw new Error(`failureThreshold must be >= 1 (got ${options.failureThreshold})`);
        }
        if (options.cooldownMs < 0) {
            throw new Error(`cooldownMs must be >= 0 (got ${options.cooldownMs})`);
        }
        this.logger = new Logger(`CircuitBreaker:${options.name}`);
    }

    tryAcquire(now: number = Date.now()): boolean {
        if (this.state === 'open') {
            if (now >= this.openUntil) {
                this.transition('half_open');
                return true;
            }
            return false;
        }
        if (this.state === 'half_open') {
            return false;
        }
        return true;
    }

    recordSuccess(): void {
        this.consecutiveFailures = 0;
        if (this.state !== 'closed') {
            this.transition('closed');
        }
    }

    recordFailure(now: number = Date.now(), minCooldownMs = 0): void {
        this.consecutiveFailures++;
        const shouldOpen = this.state === 'half_open'
            || this.consecutiveFailures >= this.options.failureThreshold;

        if (shouldOpen) {
            this.openUntil = Math.max(this.openUntil, now + Math.max(this.options.cooldownMs, minCooldownMs));
            this.transition('open');
        }
    }

    get currentState(): CircuitState {
        return this.state;
    }

    private transition(next: CircuitState): void {
        if (this.state === next) return;
        this.state = next;
        this.logger.warn(`State -> ${next}`, { consecutiveFailures: this.consecutiveFailures });
        emitMetric(CIRCUIT_BREAKER_STATE_METRIC, { breaker: this.options.name, state: next });
    }
}
