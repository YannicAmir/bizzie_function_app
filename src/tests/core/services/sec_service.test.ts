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

const resetBreaker = (): void => {
    (FmpSecService as unknown as { secBreaker: { recordSuccess(): void } }).secBreaker.recordSuccess();
};

const forceBreakerOpen = (): void => {
    const now = Date.now();
    const breaker = (FmpSecService as unknown as { secBreaker: { recordFailure(now?: number): void } }).secBreaker;
    for (let i = 0; i < 5; i++) {
        breaker.recordFailure(now);
    }
};

describe('FmpSecService', () => {
    let service: FmpSecService;
    const API_KEY = 'test-api-key';

    beforeEach(() => {
        service = new FmpSecService(API_KEY);
        mockFetch.mockReset();
        resetBreaker();
    });

    describe('getFilings', () => {
        it('returns list of filings on success', async () => {
            // Arrange
            const expectedResult: SecFiling[] = [{
                symbol: 'AAPL',
                filingDate: '2023-01-01',
                acceptedDate: '2023-01-01',
                period: 'Q1',
                formType: '10-Q',
                link: 'http://link',
                finalLink: 'http://final',
                cik: '123'
            }];

            const mockRawData = [{
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
                json: async () => mockRawData
            });

            // Act
            const result = await service.getFilings({ type: '10-Q', startDate: '2023-01-01', endDate: '2023-01-02' });

            // Assert
            expect(result).toEqual(expectedResult);
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('formType=10-Q'));
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('apikey=test-api-key'));
        });

        it('handles pagination', async () => {
            // Arrange
            const mockData = Array(5).fill({
                symbol: 'AAPL',
                filingDate: '2023-01-01',
                acceptedDate: '2023-01-01',
                formType: '10-K',
                link: 'http://link',
                finalLink: 'http://final',
                cik: '123'
            });
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            // Act
            const results = await service.getFilings({ type: '10-K', startDate: '2023-01-01', endDate: '2023-01-02' });

            // Assert
            expect(results).toHaveLength(5);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('drops rows missing required string fields', async () => {
            // Arrange
            const mockData = [
                { symbol: 'AAPL', filingDate: '2023-01-01', acceptedDate: '2023-01-01', formType: '10-K', link: 'http://link', finalLink: 'http://final', cik: '123' },
                { symbol: 'MSFT' }, // malformed: missing required fields
                'not-an-object'
            ];
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => mockData
            });

            // Act
            const results = await service.getFilings({ type: '10-K', startDate: '2023-01-01', endDate: '2023-01-02' });

            // Assert
            expect(results.map(f => f.symbol)).toEqual(['AAPL']);
        });

        it('throws error on API failure', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            // Act & Assert
            await expect(service.getFilings({ type: '10-K', startDate: '2023-01-01', endDate: '2023-01-02' }))
                .rejects.toThrow('FMP API Error: 500 Internal Server Error');
        });

        it('returns empty array if response is not an array', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ "Error Message": "Invalid key" }) // FMP error format
            });

            // Act
            const result = await service.getFilings({ type: '10-K', startDate: '2023-01-01', endDate: '2023-01-02' });

            // Assert
            expect(result).toEqual([]);
        });

        it('uses dedicated 8-K endpoint for 8-K filings', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

            // Act
            await service.getFilings({ type: '8-K', startDate: '2026-07-22', endDate: '2026-07-22' });

            // Assert
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('sec-filings-8k'));
        });

        it('filters out filings older than sinceAcceptedDate and stops paginating', async () => {
            // Arrange
            const page = [
                { symbol: 'AAA', acceptedDate: '2026-07-22 16:00:00', formType: '8-K', link: 'l1', finalLink: 'f1', filingDate: '2026-07-22', cik: '1' },
                { symbol: 'BBB', acceptedDate: '2026-07-22 15:00:00', formType: '8-K', link: 'l2', finalLink: 'f2', filingDate: '2026-07-22', cik: '2' },
                { symbol: 'CCC', acceptedDate: '2026-07-22 09:00:00', formType: '8-K', link: 'l3', finalLink: 'f3', filingDate: '2026-07-22', cik: '3' }
            ];
            mockFetch.mockResolvedValue({ ok: true, json: async () => page });

            // Act
            const result = await service.getFilings({ type: '8-K', startDate: '2026-07-22', endDate: '2026-07-22', sinceAcceptedDate: '2026-07-22 12:00:00' });

            // Assert
            expect(result.map(f => f.symbol)).toEqual(['AAA', 'BBB']);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('getFilingText', () => {
        it('fetches and strips HTML tags', async () => {
            // Arrange
            const htmlContent = '<html><body><p>Hello <b>World</b></p></body></html>';
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => htmlContent
            });

            // Act
            const result = await service.getFilingText('http://filing-url');

            // Assert
            // "Hello World" with some whitespace
            expect(result.status).toBe('ok');
            const text = result.status === 'ok' ? result.text : '';
            expect(text).toContain('Hello');
            expect(text).toContain('World');
            expect(text).not.toContain('<b>');
        });

        it('returns empty when the document has no text after stripping', async () => {
            // Arrange
            mockFetch.mockResolvedValue({
                ok: true,
                text: async () => '<html><body></body></html>'
            });
            // Act
            const result = await service.getFilingText('http://filing-url');
            // Assert
            expect(result.status).toBe('empty');
        });

        it('returns unavailable on failure', async () => {
            // Arrange
            mockFetch.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
            // Act
            const result = await service.getFilingText('http://bad-url');
            // Assert
            expect(result.status).toBe('unavailable');
        });

        it('returns unavailable on exception', async () => {
            // Arrange
            mockFetch.mockRejectedValue(new Error("Network Error"));
            // Act
            const result = await service.getFilingText('http://bad-url');
            // Assert
            expect(result.status).toBe('unavailable');
        });

        it('short-circuits without fetching when the circuit is open', async () => {
            // Arrange
            forceBreakerOpen();

            // Act
            const result = await service.getFilingText('http://filing-url');

            // Assert
            expect(result.status).toBe('unavailable');
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });
});
