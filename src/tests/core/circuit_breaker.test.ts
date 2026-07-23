import { CircuitBreaker } from '../../core/circuit_breaker';

jest.mock('../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

jest.mock('../../core/metrics', () => ({
    emitMetric: jest.fn()
}));

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        // Arrange
        breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, cooldownMs: 1000 });
    });

    it('tryAcquire_initialState_returnsTrue', () => {
        // Arrange
        // Act
        const result = breaker.tryAcquire(0);

        // Assert
        expect(result).toBe(true);
        expect(breaker.currentState).toBe('closed');
    });

    it('recordFailure_belowThreshold_staysClosed', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);

        // Act
        const result = breaker.tryAcquire(0);

        // Assert
        expect(result).toBe(true);
        expect(breaker.currentState).toBe('closed');
    });

    it('recordFailure_reachesThreshold_opensAndBlocks', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0);

        // Act
        const result = breaker.tryAcquire(500);

        // Assert
        expect(breaker.currentState).toBe('open');
        expect(result).toBe(false);
    });

    it('tryAcquire_afterCooldown_transitionsToHalfOpenAndAllowsProbe', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0);

        // Act
        const result = breaker.tryAcquire(1000);

        // Assert
        expect(result).toBe(true);
        expect(breaker.currentState).toBe('half_open');
    });

    it('tryAcquire_secondCallWhileHalfOpen_returnsFalse', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.tryAcquire(1000);

        // Act
        const secondProbe = breaker.tryAcquire(1000);

        // Assert
        expect(secondProbe).toBe(false);
        expect(breaker.currentState).toBe('half_open');
    });

    it('recordSuccess_afterHalfOpenProbe_closesCircuit', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.tryAcquire(1000);

        // Act
        breaker.recordSuccess();

        // Assert
        expect(breaker.currentState).toBe('closed');
        expect(breaker.tryAcquire(1001)).toBe(true);
    });

    it('recordFailure_onHalfOpenProbe_reopensCircuit', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.tryAcquire(1000);

        // Act
        breaker.recordFailure(1000);

        // Assert
        expect(breaker.currentState).toBe('open');
        expect(breaker.tryAcquire(1500)).toBe(false);
    });

    it('recordFailure_withMinCooldown_extendsOpenPeriod', () => {
        // Arrange
        breaker.recordFailure(0);
        breaker.recordFailure(0);
        breaker.recordFailure(0, 5000);

        // Act
        const beforeExtended = breaker.tryAcquire(1500);
        const afterExtended = breaker.tryAcquire(5000);

        // Assert
        expect(beforeExtended).toBe(false);
        expect(afterExtended).toBe(true);
    });
});
