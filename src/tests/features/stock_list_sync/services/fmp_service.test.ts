import { FmpService } from '../../../../features/stock_list_sync/services/fmp_service';
import { getRemoteConfig } from '../../../../core/remote-config';
import { retry } from '../../../../core/retry';

jest.mock('../../../../core/remote-config');
jest.mock('../../../../core/retry');
global.fetch = jest.fn();

describe('FmpService', () => {
    let service: FmpService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new FmpService();

        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com', v3Url: '', v4Url: '' }
        });
        (retry as jest.Mock).mockImplementation(async (fn) => fn());
    });

    it('should_fetchAndReturnStocks_when_apiSuccess', async () => {
        // Arrange
        const mockResponse = [
            { symbol: 'AAPL', companyName: 'Apple Inc.', price: 150 },
            { symbol: 'GOOGL', companyName: 'Alphabet Inc.', price: 2800 }
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        // Act
        const result = await service.fetchAllStocks();

        // Assert
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://api.test.com/stock-list'));
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ symbol: 'AAPL', companyName: 'Apple Inc.' });
    });

    it('should_throwError_when_apiFails', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            statusText: 'Internal Server Error'
        });

        // Act & Assert
        await expect(service.fetchAllStocks()).rejects.toThrow('Failed to fetch stock list: Internal Server Error');
    });

    it('should_throwError_when_validationFails', async () => {
        // Arrange
        const invalidResponse = [
            { symbol: 'AAPL' }
        ];

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => invalidResponse
        });

        // Act & Assert
        await expect(service.fetchAllStocks()).rejects.toThrow();
    });
});
