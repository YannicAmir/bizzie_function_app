import { makeFetchMarketDataNode } from '../../../../features/weekly_recap/storage/nodes/fetchMarketData';
import type { FmpService } from '../../../../features/weekly_recap/storage/services/fmp_service';

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    })),
}));

describe('fetchMarketDataNode', () => {
    let mockFmp: jest.Mocked<FmpService>;

    const baseState = {
        ticker: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-07',
    };

    const mockNews = [{ title: 'News', text: 'Body', publishedDate: '2024-01-02', url: 'https://n.com' }];
    const mockFilings = [{ title: '8-K', formType: '8-K', filingDate: '2024-01-04', link: 'https://sec.gov/8k', finalLink: 'https://sec.gov/8k/f' }];
    const mockPrices = [{ date: '2024-01-01', price: 185, volume: 1000000 }];

    beforeEach(() => {
        // Arrange
        mockFmp = {
            getNews: jest.fn(),
            get8Ks: jest.fn(),
            getEodStockPrice: jest.fn(),
        } as unknown as jest.Mocked<FmpService>;
    });

    it('fetchMarketDataNode_allSuccess_returnsAllData', async () => {
        // Arrange
        mockFmp.getNews.mockResolvedValue(mockNews);
        mockFmp.get8Ks.mockResolvedValue(mockFilings);
        mockFmp.getEodStockPrice.mockResolvedValue(mockPrices);
        const node = makeFetchMarketDataNode(mockFmp);

        // Act
        const result = await node(baseState as never);

        // Assert
        expect(result.news).toEqual(mockNews);
        expect(result.filings).toEqual(mockFilings);
        expect(result.prices).toEqual(mockPrices);
    });

    it('fetchMarketDataNode_newsFails_defaultsNewsToEmptyArray', async () => {
        // Arrange
        mockFmp.getNews.mockRejectedValue(new Error('Network error'));
        mockFmp.get8Ks.mockResolvedValue(mockFilings);
        mockFmp.getEodStockPrice.mockResolvedValue(mockPrices);
        const node = makeFetchMarketDataNode(mockFmp);

        // Act
        const result = await node(baseState as never);

        // Assert
        expect(result.news).toEqual([]);
        expect(result.filings).toEqual(mockFilings);
        expect(result.prices).toEqual(mockPrices);
    });

    it('fetchMarketDataNode_pricesFail_defaultsPricesToEmptyArray', async () => {
        // Arrange
        mockFmp.getNews.mockResolvedValue(mockNews);
        mockFmp.get8Ks.mockResolvedValue(mockFilings);
        mockFmp.getEodStockPrice.mockRejectedValue(new Error('FMP timeout'));
        const node = makeFetchMarketDataNode(mockFmp);

        // Act
        const result = await node(baseState as never);

        // Assert
        expect(result.prices).toEqual([]);
        expect(result.news).toEqual(mockNews);
    });

    it('fetchMarketDataNode_allFail_returnsAllEmptyArrays', async () => {
        // Arrange
        mockFmp.getNews.mockRejectedValue(new Error('err'));
        mockFmp.get8Ks.mockRejectedValue(new Error('err'));
        mockFmp.getEodStockPrice.mockRejectedValue(new Error('err'));
        const node = makeFetchMarketDataNode(mockFmp);

        // Act
        const result = await node(baseState as never);

        // Assert
        expect(result.news).toEqual([]);
        expect(result.filings).toEqual([]);
        expect(result.prices).toEqual([]);
    });
});
