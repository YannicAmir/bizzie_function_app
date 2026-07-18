import { FmpChartService } from '../../../../features/stock_price_sync/services/fmp_chart_service';
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

const WINDOW = { from: '2026-01-06', to: '2026-01-06' };

const mockResponse = (items: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => items
    });
};

describe('FmpChartService', () => {
    let service: FmpChartService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (retry as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com' }
        });
        service = new FmpChartService('test-key');
    });

    it('fetchIntradayBars_validResponse_returnsMappedBars', async () => {
        // Arrange
        mockResponse([
            { date: '2026-01-06 09:30:00', open: 101, low: 100, high: 103, close: 102, volume: 5000 }
        ]);

        // Act
        const result = await service.fetchIntradayBars('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([
            { date: '2026-01-06 09:30:00', open: 101, low: 100, high: 103, close: 102, volume: 5000 }
        ]);
        const calledUrl = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
        expect(calledUrl).toContain('https://api.test.com/historical-chart/1min?symbol=AAPL');
        expect(calledUrl).toContain('from=2026-01-06&to=2026-01-06');
        expect(calledUrl).toContain('apikey=test-key');
    });

    it('fetchIntradayBars_missingOptionalFields_defaultsFromClose', async () => {
        // Arrange
        mockResponse([{ date: '2026-01-06 09:31:00', close: 55 }]);

        // Act
        const result = await service.fetchIntradayBars('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([
            { date: '2026-01-06 09:31:00', open: 55, low: 55, high: 55, close: 55, volume: 0 }
        ]);
    });

    it('fetchIntradayBars_invalidRows_dropsInvalidBars', async () => {
        // Arrange
        mockResponse([
            { close: 5 },
            { date: '2026-01-06 09:30:00', close: 'x' },
            { date: '2026-01-06 09:31:00', close: 10 },
            'not-an-object'
        ]);

        // Act
        const result = await service.fetchIntradayBars('AAPL', WINDOW);

        // Assert
        expect(result).toEqual([
            { date: '2026-01-06 09:31:00', open: 10, low: 10, high: 10, close: 10, volume: 0 }
        ]);
    });

    it('fetchIntradayBars_httpError_throwsAppError', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        // Act & Assert
        await expect(service.fetchIntradayBars('AAPL', WINDOW)).rejects.toThrow(
            'FMP intraday fetch failed for AAPL: Internal Server Error'
        );
    });

    it('fetchIntradayBars_nonArrayResponse_throwsAppError', async () => {
        // Arrange
        mockResponse({ error: 'rate limited' });

        // Act & Assert
        await expect(service.fetchIntradayBars('AAPL', WINDOW)).rejects.toThrow(
            'FMP intraday fetch returned a non-array response for AAPL'
        );
    });
});
