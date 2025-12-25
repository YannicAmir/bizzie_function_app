import { retry } from '../../core/retry';

describe('retry', () => {
    test('succeeds immediately on first try', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const result = await retry(fn);
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries and succeeds eventually', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('success');

        const result = await retry(fn, { initialDelayMs: 1 }); // Fast retry for test
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    test('fails after max attempts', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fail'));

        await expect(retry(fn, { maxAttempts: 3, initialDelayMs: 1 }))
            .rejects.toThrow('fail');

        expect(fn).toHaveBeenCalledTimes(3);
    });

    test('respects shouldRetry predicate', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('fatal error'));
        const shouldRetry = jest.fn().mockReturnValue(false); // Don't retry

        await expect(retry(fn, { maxAttempts: 3, shouldRetry }))
            .rejects.toThrow('fatal error');

        expect(fn).toHaveBeenCalledTimes(1);
    });
});
