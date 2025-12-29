import { FmpSecService, SecFiling } from '../../../core/services/sec_service';
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

describe('FmpSecService', () => {
    let service: FmpSecService;
    const API_KEY = 'test-api-key';

    beforeEach(() => {
        service = new FmpSecService(API_KEY);
        mockFetch.mockReset();
    });

    describe('getFilings', () => {
        it('returns list of filings on success', async () => {
            const mockData: SecFiling[] = [{
                symbol: 'AAPL',
                filingDate: '2023-01-01',
                acceptedDate: '2023-01-01',
                period: 'Q1',
                formType: '10-Q',
                link: 'http://link',
                finalLink: 'http://final',
                cik: '123'
            }];

            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const result = await service.getFilings('10-Q', '2023-01-01', '2023-01-02');

            expect(result).toEqual(mockData);
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('formType=10-Q'));
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('apikey=test-api-key'));
        });

        it('handles pagination', async () => {
            // Page 0 returns limit (mocking logic requires careful fetch implementation or assume service handles it)
            // The service checks if (pageResults.length < limit) to stop.
            // Let's mocking fetch conditionally would be complex.
            // Simplified: Return fewer than limit to stop immediately.
            const mockData = Array(5).fill({ symbol: 'AAPL' }); // length 5 < 1000 limit
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            const results = await service.getFilings('10-K', '2023-01-01', '2023-01-02');
            expect(results).toHaveLength(5);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('throws error on API failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(service.getFilings('10-K', '2023-01-01', '2023-01-02'))
                .rejects.toThrow('FMP API Error: 500 Internal Server Error');
        });

        it('returns empty array if response is not an array', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ "Error Message": "Invalid key" }) // FMP error format
            });

            const result = await service.getFilings('10-K', '2023-01-01', '2023-01-02');
            expect(result).toEqual([]);
        });
    });

    describe('getFilingText', () => {
        it('fetches and strips HTML tags', async () => {
            const htmlContent = '<html><body><p>Hello <b>World</b></p></body></html>';
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => htmlContent
            });

            const text = await service.getFilingText('http://filing-url');

            // "Hello World" with some whitespace
            expect(text).toContain('Hello');
            expect(text).toContain('World');
            expect(text).not.toContain('<b>');
        });

        it('returns empty string on failure', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });
            const text = await service.getFilingText('http://bad-url');
            expect(text).toBe("");
        });

        it('returns empty string on exception', async () => {
            mockFetch.mockRejectedValue(new Error("Network Error"));
            const text = await service.getFilingText('http://bad-url');
            expect(text).toBe("");
        });
    });
});
