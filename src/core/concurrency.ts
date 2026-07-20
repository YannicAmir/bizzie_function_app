
export async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    const concurrency = Math.max(1, limit);
    let cursor = 0;

    const runner = async (): Promise<void> => {
        while (cursor < items.length) {
            const item = items[cursor++];
            if (item === undefined) continue;
            await worker(item);
        }
    };

    const runners: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
        runners.push(runner());
    }
    await Promise.all(runners);
}
