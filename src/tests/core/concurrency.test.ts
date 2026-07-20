import { runWithConcurrency } from '../../core/concurrency';

describe('runWithConcurrency', () => {
    it('runWithConcurrency_multipleItems_invokesWorkerForEachItem', async () => {
        // Arrange
        const items = [1, 2, 3, 4, 5];
        const processed: number[] = [];
        const worker = jest.fn(async (item: number): Promise<void> => {
            processed.push(item);
        });

        // Act
        await runWithConcurrency(items, 2, worker);

        // Assert
        expect(worker).toHaveBeenCalledTimes(5);
        expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });

    it('runWithConcurrency_limitBelowItemCount_neverExceedsConcurrencyLimit', async () => {
        // Arrange
        const items = [1, 2, 3, 4, 5, 6];
        let active = 0;
        let maxActive = 0;
        const worker = async (): Promise<void> => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
        };

        // Act
        await runWithConcurrency(items, 2, worker);

        // Assert
        expect(maxActive).toBe(2);
    });

    it('runWithConcurrency_limitZero_clampsToSingleRunner', async () => {
        // Arrange
        const items = [1, 2, 3];
        let active = 0;
        let maxActive = 0;
        const worker = async (): Promise<void> => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
        };

        // Act
        await runWithConcurrency(items, 0, worker);

        // Assert
        expect(maxActive).toBe(1);
    });

    it('runWithConcurrency_limitExceedsItemCount_runsAllItemsWithoutError', async () => {
        // Arrange
        const items = [1, 2];
        const worker = jest.fn(async (): Promise<void> => {});

        // Act
        await runWithConcurrency(items, 10, worker);

        // Assert
        expect(worker).toHaveBeenCalledTimes(2);
    });

    it('runWithConcurrency_emptyItems_neverInvokesWorker', async () => {
        // Arrange
        const worker = jest.fn(async (): Promise<void> => {});

        // Act
        await runWithConcurrency([], 3, worker);

        // Assert
        expect(worker).not.toHaveBeenCalled();
    });

    it('runWithConcurrency_undefinedItems_skipsUndefinedEntries', async () => {
        // Arrange
        const items = [1, undefined, 3];
        const worker = jest.fn(async (): Promise<void> => {});

        // Act
        await runWithConcurrency(items, 2, worker);

        // Assert
        expect(worker).toHaveBeenCalledTimes(2);
        expect(worker).not.toHaveBeenCalledWith(undefined);
    });

    it('runWithConcurrency_workerRejects_propagatesError', async () => {
        // Arrange
        const items = [1, 2, 3];
        const worker = async (): Promise<void> => {
            throw new Error('worker failed');
        };

        // Act & Assert
        await expect(runWithConcurrency(items, 2, worker)).rejects.toThrow('worker failed');
    });
});
