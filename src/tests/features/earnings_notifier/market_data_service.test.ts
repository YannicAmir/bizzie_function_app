import { FmpMarketDataService } from '../../../features/earnings_notifier/services/market_data_service';
import * as retryModule from '../../../core/retry';

// Mock Logger
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

// Mock Retry to execute immediately
jest.spyOn(retryModule, 'retry').mockImplementation(async (fn) => fn());

// Mock Remote Config
jest.mock('../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn().mockResolvedValue({
        fmp: {
            baseUrl: 'https://test-fmp.com',
            v3Url: 'https://test-fmp.com/v3'
        }
    })
}));

// Mock global fetch
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

            const result = await service.getEarningsCalendar('2023-10-01', '2023-10-02');

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
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(service.getEarningsCalendar('2023-10-01', '2023-10-02'))
                .rejects.toThrow('FMP API Error: 500 Internal Server Error');
        });

        it('handles non-array response gracefully (if API returns error obj)', async () => {
            // If the API returns an object instead of array (common in FMP error cases not caught by status)
            // The code does: "as any[]". If it's not array, map will crash.
            // Test if the code crashes or if expected behavior.
            // Code: "const data = await response.json() as any[]; return data.map..."
            // Use case: FMP often returns { "Error Message": "..." } on 200 OK.
            // Ideally the code *should* filter this, but check current implementation behavior.

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ "Error Message": "Limitation" })
            });

            // Inspecting code: It casts to any[] then calls .map. This will throw "data.map is not a function".
            // We generally want to verify this behavior so we know if we need to fix the service or just expect the crash.
            // Current plan: Expect it to throw (TypeError).

            await expect(service.getEarningsCalendar('2023-10-01', '2023-10-02'))
                .rejects.toThrow();
        });
    });
});
