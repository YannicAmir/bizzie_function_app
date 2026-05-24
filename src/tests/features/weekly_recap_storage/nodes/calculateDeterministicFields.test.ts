import { makeCalculateDeterministicFieldsNode } from '../../../../features/weekly_recap/storage/nodes/calculateDeterministicFields';
import type { StockPrice } from '../../../../features/weekly_recap/storage/models';

describe('calculateDeterministicFieldsNode', () => {
    const node = makeCalculateDeterministicFieldsNode();

    const buildState = (overrides: { prices?: StockPrice[] } = {}) => ({
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        startDate: '2024-01-01',
        endDate: '2024-01-07',
        news: [{ title: 'n1', text: 't', publishedDate: '2024-01-01', url: 'https://a.com' }],
        filings: [
            { title: '8k1', formType: '8-K', filingDate: '2024-01-03', link: 'https://c.com', finalLink: 'https://c.com/f' },
            { title: '8k2', formType: '8-K', filingDate: '2024-01-04', link: 'https://d.com', finalLink: 'https://d.com/f' },
        ],
        prices: overrides.prices ?? [
            { date: '2024-01-01', price: 100, volume: 1000 },
            { date: '2024-01-07', price: 110, volume: 2000 },
        ],
    });

    it('calculateDeterministicFieldsNode_withAllData_returnsCorrectCounts', async () => {
        // Arrange
        const state = buildState();

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.counts).toEqual({
            newArticleCount: 1,
            eightKCount: 2,
            eodStockPriceCount: 2,
        });
    });

    it('calculateDeterministicFieldsNode_withPrices_computesPriceMovement', async () => {
        // Arrange
        const state = buildState({
            prices: [
                { date: '2024-01-01', price: 100, volume: 1000 },
                { date: '2024-01-07', price: 110, volume: 2000 },
            ],
        });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.priceMovement).toEqual({
            startPrice: 100,
            endPrice: 110,
            priceChange: 10,
            priceChangePercent: 10,
        });
    });

    it('calculateDeterministicFieldsNode_pricesSortedByDate_usesChronologicalOrder', async () => {
        // Arrange
        const state = buildState({
            prices: [
                { date: '2024-01-07', price: 120, volume: 500 },
                { date: '2024-01-01', price: 100, volume: 1000 },
                { date: '2024-01-04', price: 110, volume: 800 },
            ],
        });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.priceMovement?.startPrice).toBe(100);
        expect(result.priceMovement?.endPrice).toBe(120);
    });

    it('calculateDeterministicFieldsNode_emptyPrices_returnsNullPriceMovement', async () => {
        // Arrange
        const state = buildState({ prices: [] });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.priceMovement).toEqual({
            startPrice: null,
            endPrice: null,
            priceChange: null,
            priceChangePercent: null,
        });
    });

    it('calculateDeterministicFieldsNode_emptyPrices_setsEodStockPriceCountToZero', async () => {
        // Arrange
        const state = buildState({ prices: [] });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.counts?.eodStockPriceCount).toBe(0);
    });

    it('calculateDeterministicFieldsNode_zeroStartPrice_priceChangePercentIsNull', async () => {
        // Arrange
        const state = buildState({
            prices: [
                { date: '2024-01-01', price: 0, volume: 0 },
                { date: '2024-01-07', price: 10, volume: 100 },
            ],
        });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.priceMovement?.priceChangePercent).toBeNull();
        expect(result.priceMovement?.priceChange).toBe(10);
    });

    it('calculateDeterministicFieldsNode_singlePrice_priceChangeIsZero', async () => {
        // Arrange
        const state = buildState({
            prices: [{ date: '2024-01-01', price: 150, volume: 5000 }],
        });

        // Act
        const result = await node(state as never);

        // Assert
        expect(result.priceMovement?.startPrice).toBe(150);
        expect(result.priceMovement?.endPrice).toBe(150);
        expect(result.priceMovement?.priceChange).toBe(0);
        expect(result.priceMovement?.priceChangePercent).toBe(0);
    });
});
