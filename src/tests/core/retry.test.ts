
// Mock logger
jest.mock('../../core/logger', () => {
    return {
        Logger: jest.fn().mockImplementation(() => ({
            warn: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        }))
    };
});

import { retry } from '../../core/retry';

describe('retry utility (Real Timers)', () => {
    // using real timers implicitly

    it('should return result immediately if function succeeds', async () => {
        // Arrange
        const fn = jest.fn().mockResolvedValue('success');

        // Act
        const result = await retry(fn);

        // Assert
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
        // Arrange
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('success');

        // Act
        // Use very small delays for speed
        const promise = retry(fn, { initialDelayMs: 1, backoffFactor: 1 });
        const result = await promise;

        // Assert
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max attempts reached', async () => {
        // Arrange
        const fn = jest.fn().mockRejectedValue(new Error('always fail'));

        // Act
        const promise = retry(fn, { maxAttempts: 3, initialDelayMs: 1, backoffFactor: 1 });

        // Assert
        await expect(promise).rejects.toThrow('always fail');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect shouldRetry predicate', async () => {
        // Arrange
        const fn = jest.fn().mockRejectedValue(new Error('fatal error'));
        const shouldRetry = jest.fn().mockReturnValue(false);

        // Act & Assert
        await expect(retry(fn, { shouldRetry })).rejects.toThrow('fatal error');
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
