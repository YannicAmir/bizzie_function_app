import { FmpService } from '../../../../features/weekly_recap/storage/services/fmp_service';

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

jest.mock('../../../../core/config', () => ({
    config: { fmpApiKey: 'test-api-key' },
}));

jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn().mockResolvedValue({
        fmp: { baseUrl: 'https://test.fmp.com' },
    }),
}));

describe('FmpService', () => {
    let service: FmpService;
    let mockFetch: jest.Mock;

    beforeEach(() => {
        // Arrange
        mockFetch = jest.fn();
        global.fetch = mockFetch;
        service = new FmpService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getNews', () => {
        it('getNews_success_returnsMappedArticles', async () => {
            // Arrange
            const rawArticles = [
                { title: 'Big news', text: 'Details here', publishedDate: '2024-01-05', url: 'https://news.com/1' },
                { title: 'More news', text: 'More details', publishedDate: '2024-01-06', url: 'https://news.com/2' },
            ];
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rawArticles) });

            // Act
            const result = await service.getNews('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ title: 'Big news', text: 'Details here', publishedDate: '2024-01-05', url: 'https://news.com/1' });
            expect(result[1]).toEqual({ title: 'More news', text: 'More details', publishedDate: '2024-01-06', url: 'https://news.com/2' });
        });

        it('getNews_emptyResponse_returnsEmptyArray', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

            // Act
            const result = await service.getNews('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toEqual([]);
        });

        it('getNews_fetchReturnsNonOkStatus_throwsError', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

            // Act & Assert
            await expect(service.getNews('AAPL', '2024-01-01', '2024-01-07')).rejects.toThrow(
                'FMP news fetch failed: Too Many Requests',
            );
        });

        it('getNews_missingFields_defaultsToEmptyStrings', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([{}]) });

            // Act
            const result = await service.getNews('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result[0]).toEqual({ title: '', text: '', publishedDate: '', url: '' });
        });
    });

    describe('get8Ks', () => {
        it('get8Ks_success_filtersToEightKOnly', async () => {
            // Arrange
            const rawFilings = [
                { formType: '8-K', title: '8-K Filing', filingDate: '2024-01-03', link: 'https://sec.gov/8k', finalLink: 'https://sec.gov/8k/final' },
                { formType: '10-Q', title: '10-Q Filing', filingDate: '2024-01-02', link: 'https://sec.gov/10q', finalLink: 'https://sec.gov/10q/final' },
            ];
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rawFilings) });

            // Act
            const result = await service.get8Ks('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                title: '8-K Filing',
                formType: '8-K',
                filingDate: '2024-01-03',
                link: 'https://sec.gov/8k',
                finalLink: 'https://sec.gov/8k/final',
            });
        });

        it('get8Ks_noEightKFilings_returnsEmptyArray', async () => {
            // Arrange
            const rawFilings = [
                { formType: '10-Q', title: '10-Q Filing', filingDate: '2024-01-02', link: 'https://sec.gov/10q', finalLink: '' },
            ];
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rawFilings) });

            // Act
            const result = await service.get8Ks('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toEqual([]);
        });

        it('get8Ks_fetchFails_throwsError', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

            // Act & Assert
            await expect(service.get8Ks('AAPL', '2024-01-01', '2024-01-07')).rejects.toThrow(
                'FMP 8Ks fetch failed: Service Unavailable',
            );
        });
    });

    describe('getEodStockPrice', () => {
        it('getEodStockPrice_success_returnsMappedPrices', async () => {
            // Arrange
            const rawPrices = [
                { date: '2024-01-01', price: 185.5, volume: 1000000 },
                { date: '2024-01-02', price: 187.0, volume: 900000 },
            ];
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rawPrices) });

            // Act
            const result = await service.getEodStockPrice('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ date: '2024-01-01', price: 185.5, volume: 1000000 });
            expect(result[1]).toEqual({ date: '2024-01-02', price: 187.0, volume: 900000 });
        });

        it('getEodStockPrice_emptyResponse_returnsEmptyArray', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

            // Act
            const result = await service.getEodStockPrice('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result).toEqual([]);
        });

        it('getEodStockPrice_missingNumericFields_defaultsToZero', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([{}]) });

            // Act
            const result = await service.getEodStockPrice('AAPL', '2024-01-01', '2024-01-07');

            // Assert
            expect(result[0]).toEqual({ date: '', price: 0, volume: 0 });
        });
    });
});
