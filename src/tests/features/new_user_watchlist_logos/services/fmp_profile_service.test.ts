import { FmpProfileService } from '../../../../features/new_user_watchlist_logos/services/fmp_profile_service';
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

const mockJsonResponse = (payload: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => payload
    });
};

describe('FmpProfileService', () => {
    let service: FmpProfileService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (retry as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());
        (getRemoteConfig as jest.Mock).mockResolvedValue({
            fmp: { baseUrl: 'https://api.test.com' }
        });
        service = new FmpProfileService('test-key');
    });

    it('fetchLogoUrl_validProfile_returnsImageAndBuildsUrl', async () => {
        // Arrange
        mockJsonResponse([{ symbol: 'AAPL', image: 'https://img/aapl.png' }]);

        // Act
        const result = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(result).toBe('https://img/aapl.png');
        const calledUrl = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
        expect(calledUrl).toContain('https://api.test.com/profile?symbol=AAPL');
        expect(calledUrl).toContain('apikey=test-key');
    });

    it('fetchLogoUrl_tickerWithDot_normalizesSymbolToDash', async () => {
        // Arrange
        mockJsonResponse([{ symbol: 'BRK.B', image: 'https://img/brkb.png' }]);

        // Act
        const result = await service.fetchLogoUrl('BRK.B');

        // Assert
        expect(result).toBe('https://img/brkb.png');
        const calledUrl = (global.fetch as jest.Mock).mock.calls[0]![0] as string;
        expect(calledUrl).toContain('symbol=BRK-B');
    });

    it('fetchLogoUrl_cachedTicker_skipsSecondFetch', async () => {
        // Arrange
        mockJsonResponse([{ symbol: 'AAPL', image: 'https://img/aapl.png' }]);

        // Act
        const first = await service.fetchLogoUrl('AAPL');
        const second = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(first).toBe('https://img/aapl.png');
        expect(second).toBe('https://img/aapl.png');
        expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('fetchLogoUrl_emptyImageField_returnsNull', async () => {
        // Arrange
        mockJsonResponse([{ symbol: 'AAPL', image: '' }]);

        // Act
        const result = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(result).toBeNull();
    });

    it('fetchLogoUrl_nonArrayResponse_returnsNull', async () => {
        // Arrange
        mockJsonResponse({ symbol: 'AAPL', image: 'https://img/aapl.png' });

        // Act
        const result = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(result).toBeNull();
    });

    it('fetchLogoUrl_httpErrorNonTransient_returnsNullAndCachesNull', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found'
        });

        // Act
        const first = await service.fetchLogoUrl('AAPL');
        const second = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('fetchLogoUrl_httpErrorTransient_returnsNullWithoutCaching', async () => {
        // Arrange
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable'
        });

        // Act
        const first = await service.fetchLogoUrl('AAPL');
        const second = await service.fetchLogoUrl('AAPL');

        // Assert
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2);
    });
});
