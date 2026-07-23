import { FmpClient, FmpEndpoint } from '../../../../features/ytd_price_sync/services/fmp_client';
import { getRemoteConfig } from '../../../../core/remote-config';
import { retry } from '../../../../core/retry';

jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: jest.fn()
}));
jest.mock('../../../../core/retry', () => ({
    retry: jest.fn()
}));
jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

global.fetch = jest.fn();

interface TestRow {
    value: number;
}

const TEST_ENDPOINT: FmpEndpoint<TestRow> = {
    path: '/test-endpoint',
    label: 'TEST',
    fetchFailedCode: 'TEST_FETCH_FAILED',
    invalidResponseCode: 'TEST_INVALID_RESPONSE',
    parseRow: (item: unknown): TestRow | null => {
        if (typeof item !== 'object' || item === null) return null;
        const raw = item as { value?: unknown };
        if (typeof raw.value !== 'number') return null;
        return { value: raw.value };
    }
};

const WINDOW = { from: '2026-01-02', to: '2026-01-06' };

const mockResponse = (items: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => items
    });
};

describe('FmpClient', () => {
    let client: FmpClient;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (retry as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com' }
        });
        client = new FmpClient('test-key');
    });

    it('fetchWindowedRows_validResponse_returnsParsedRowsAndBuildsUrl', async () => {
        // Arrange
        mockResponse([{ value: 1 }, { value: 2 }]);

        // Act
        const result = await client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW);

        // Assert
        expect(result).toEqual([{ value: 1 }, { value: 2 }]);
        const calledUrl = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
        expect(calledUrl).toContain('https://api.test.com/test-endpoint?symbol=AAPL');
        expect(calledUrl).toContain('from=2026-01-02&to=2026-01-06');
        expect(calledUrl).toContain('apikey=test-key');
    });

    it('fetchWindowedRows_emptyArray_returnsEmpty', async () => {
        // Arrange
        mockResponse([]);

        // Act
        const result = await client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW);

        // Assert
        expect(result).toEqual([]);
    });

    it('fetchWindowedRows_invalidRows_dropsUnparseableRecords', async () => {
        // Arrange
        mockResponse([{ value: 1 }, { value: 'x' }, 'not-an-object', { value: 3 }]);

        // Act
        const result = await client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW);

        // Assert
        expect(result).toEqual([{ value: 1 }, { value: 3 }]);
    });

    it('fetchWindowedRows_httpError_throwsAppError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        // Act & Assert
        await expect(client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW)).rejects.toThrow(
            'FMP TEST fetch failed for AAPL: Internal Server Error'
        );
    });

    it('fetchWindowedRows_unparseableJson_throwsAppError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => { throw new SyntaxError('Unexpected token'); }
        });

        // Act & Assert
        await expect(client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW)).rejects.toThrow(
            'FMP TEST returned an unparseable response for AAPL'
        );
    });

    it('fetchWindowedRows_nonArrayResponse_throwsAppError', async () => {
        // Arrange
        mockResponse({ error: 'rate limited' });

        // Act & Assert
        await expect(client.fetchWindowedRows(TEST_ENDPOINT, 'AAPL', WINDOW)).rejects.toThrow(
            'FMP TEST fetch returned a non-array response for AAPL'
        );
    });
});
