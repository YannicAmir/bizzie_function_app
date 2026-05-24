import { makeStoreSummaryNode } from '../../../../features/weekly_recap/storage/nodes/storeSummary';
import type { FirestoreService } from '../../../../features/weekly_recap/storage/services/firestore_service';
import type { LLMResponse } from '../../../../features/weekly_recap/storage/models';

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    })),
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

describe('storeSummaryNode', () => {
    let mockDb: jest.Mocked<FirestoreService>;

    const buildLlmResponse = (): LLMResponse => ({
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        time: '2026-05-15T00:00:00.000Z',
        messageTitle: 'Apple Recap',
        messageShortSummary: 'Short.',
        messageLongSummary: 'Long narrative.',
        confidenceScore: 85,
        newArticleCount: 3,
        eightKCount: 0,
        eodStockPriceCount: 5,
        newsLinks: [],
        eightKLinks: [],
        priceMovement: { startPrice: 200, endPrice: 210, priceChange: 10, priceChangePercent: 5 },
    });

    beforeEach(() => {
        // Arrange
        mockDb = {
            retrieveCompaniesFromDb: jest.fn(),
            storeSummaryInDb: jest.fn(),
        } as unknown as jest.Mocked<FirestoreService>;
    });

    it('storeSummaryNode_success_callsStoreSummaryInDb', async () => {
        // Arrange
        const llmResponse = buildLlmResponse();
        mockDb.storeSummaryInDb.mockResolvedValue(undefined);
        const node = makeStoreSummaryNode(mockDb);
        const state = { llmResponse } as never;

        // Act
        const result = await node(state);

        // Assert
        expect(mockDb.storeSummaryInDb).toHaveBeenCalledWith(llmResponse);
        expect(result).toEqual({});
    });

    it('storeSummaryNode_dbThrows_rethrowsError', async () => {
        // Arrange
        const llmResponse = buildLlmResponse();
        mockDb.storeSummaryInDb.mockRejectedValue(new Error('Firestore write failed'));
        const node = makeStoreSummaryNode(mockDb);
        const state = { llmResponse } as never;

        // Act & Assert
        await expect(node(state)).rejects.toThrow('Firestore write failed');
    });
});
