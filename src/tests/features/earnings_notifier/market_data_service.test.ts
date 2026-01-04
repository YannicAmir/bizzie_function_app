import { FmpMarketDataService } from '../../../features/earnings_notifier/services/market_data_service';
import * as retryModule from '../../../core/retry';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

jest.spyOn(retryModule, 'retry').mockImplementation(async (fn) => fn());

jest.mock('../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn().mockResolvedValue({
        fmp: {
            baseUrl: 'https://test-fmp.com',
            v3Url: 'https://test-fmp.com/v3'
        }
    })
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('FmpMarketDataService', () => {
    let service: FmpMarketDataService;
    const API_KEY = 'test-api-key';

    beforeEach(() => {
        service = new FmpMarketDataService(API_KEY);
        mockFetch.mockReset();
    });

    describe('getEarningsCalendar', () => {
        it('getEarningsCalendar_validResponse_returnsMappedEvents', async () => {
            // Arrange
            const mockRawData = [{
                date: '2023-10-01',
                symbol: 'AAPL',
                epsActual: 1.5,
                epsEstimated: 1.4,
                revenueActual: 1000000,
                revenueEstimated: 900000,
                lastUpdated: '2023-10-01',
                time: 'bmo'
            }];

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockRawData
            });

            // Act
            const result = await service.getEarningsCalendar('2023-10-01', '2023-10-02');

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                date: '2023-10-01',
                symbol: 'AAPL',
                epsActual: 1.5,
                epsEstimated: 1.4,
                revenueActual: 1000000,
                revenueEstimated: 900000,
                lastUpdated: '2023-10-01',
                time: 'bmo'
            });
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('earnings-calendar'));
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('apikey=test-api-key'));
        });

        it('getEarningsCalendar_apiError_throws', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            // Act & Assert
            await expect(service.getEarningsCalendar('2023-10-01', '2023-10-02'))
                .rejects.toThrow('FMP API Error: 500 Internal Server Error');
        });

        it('handles non-array response gracefully (if API returns error obj)', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ "Error Message": "Limitation" })
            });

            // Act & Assert
            await expect(service.getEarningsCalendar('2023-10-01', '2023-10-02'))
                .rejects.toThrow();
        });
    });
});
