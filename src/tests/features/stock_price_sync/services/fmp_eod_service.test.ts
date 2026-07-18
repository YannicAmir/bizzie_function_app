import { FmpEodService } from '../../../../features/stock_price_sync/services/fmp_eod_service';
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

const WINDOW = { from: '2026-01-02', to: '2026-01-06' };

const mockResponse = (items: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => items
    });
};

describe('FmpEodService', () => {
    let service: FmpEodService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (retry as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com' }
        });
        service = new FmpEodService('test-key');
    });

    it('fetchDailyCloses_validResponse_returnsMappedCloses', async () => {
        // Arrange
        mockResponse([
            { symbol: 'AAPL', date: '2026-01-05', price: 100, volume: 1000 },
            { symbol: 'AAPL', date: '2026-01-02', price: 98, volume: 900 }
        ]);

        // Act
        const result = await service.fetchDailyCloses('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([
            { date: '2026-01-05', close: 100 },
            { date: '2026-01-02', close: 98 }
        ]);
        const calledUrl = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
        expect(calledUrl).toContain('https://api.test.com/historical-price-eod/light?symbol=AAPL');
        expect(calledUrl).toContain('from=2026-01-02&to=2026-01-06');
        expect(calledUrl).toContain('apikey=test-key');
    });

    it('fetchDailyCloses_emptyArray_returnsEmpty', async () => {
        // Arrange
        mockResponse([]);

        // Act
        const result = await service.fetchDailyCloses('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([]);
    });

    it('fetchDailyCloses_invalidRows_dropsInvalidRecords', async () => {
        // Arrange
        mockResponse([
            { price: 5 },
            { date: '2026-01-05', price: 'x' },
            { date: '2026-01-06', price: 10 },
            'not-an-object'
        ]);

        // Act
        const result = await service.fetchDailyCloses('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([{ date: '2026-01-06', close: 10 }]);
    });

    it('fetchDailyCloses_httpError_throwsAppError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        // Act & Assert
        await expect(service.fetchDailyCloses('AAPL', WINDOW)).rejects.toThrow(
            'FMP EOD fetch failed for AAPL: Internal Server Error'
        );
    });

    it('fetchDailyCloses_nonArrayResponse_throwsAppError', async () => {
        // Arrange
        mockResponse({ error: 'rate limited' });

        // Act & Assert
        await expect(service.fetchDailyCloses('AAPL', WINDOW)).rejects.toThrow(
            'FMP EOD fetch returned a non-array response for AAPL'
        );
    });
});
