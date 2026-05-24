import { makeAssembleResponseNode } from '../../../../features/weekly_recap/storage/nodes/assembleResponse';

const FIXED_NOW = '2026-05-15T12:00:00.000Z';

describe('assembleResponseNode', () => {
    beforeEach(() => {
        // Arrange
        jest.useFakeTimers().setSystemTime(new Date(FIXED_NOW));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const buildState = () => ({
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        startDate: '2026-05-08T00:00:00.000Z',
        endDate: '2026-05-15T00:00:00.000Z',
        news: [],
        filings: [],
        prices: [],
        counts: {
            newArticleCount: 4,
            eightKCount: 1,
            eodStockPriceCount: 5,
        },
        priceMovement: { startPrice: 200, endPrice: 215, priceChange: 15, priceChangePercent: 7.5 },
        llmPartial: {
            messageTitle: 'Apple Surges',
            messageShortSummary: 'Apple had a great week.',
            messageLongSummary: 'Detailed analysis of Apple movements.',
            confidenceScore: 90,
            newsLinks: ['https://news.com/1'],
            eightKLinks: [],
        },
    });

    it('assembleResponseNode_success_buildsCompleteLlmResponse', async () => {
        // Arrange
        const node = makeAssembleResponseNode();
        const state = buildState();

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.llmResponse).toMatchObject({
            ticker: 'AAPL',
            companyName: 'Apple Inc.',
            messageTitle: 'Apple Surges',
            messageShortSummary: 'Apple had a great week.',
            messageLongSummary: 'Detailed analysis of Apple movements.',
            confidenceScore: 90,
            newArticleCount: 4,
            eightKCount: 1,
            eodStockPriceCount: 5,
            newsLinks: ['https://news.com/1'],
            eightKLinks: [],
            priceMovement: { startPrice: 200, endPrice: 215, priceChange: 15, priceChangePercent: 7.5 },
        });
    });

    it('assembleResponseNode_success_setsTimeToCurrentIsoString', async () => {
        // Arrange
        const node = makeAssembleResponseNode();
        const state = buildState();

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.llmResponse?.time).toBe(FIXED_NOW);
    });

    it('assembleResponseNode_emptyLinks_preservesEmptyArrays', async () => {
        // Arrange
        const node = makeAssembleResponseNode();
        const state = {
            ...buildState(),
            llmPartial: {
                ...buildState().llmPartial,
                newsLinks: [],
                eightKLinks: [],
            },
        };

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.llmResponse?.newsLinks).toEqual([]);
        expect(result.llmResponse?.eightKLinks).toEqual([]);
    });
});
