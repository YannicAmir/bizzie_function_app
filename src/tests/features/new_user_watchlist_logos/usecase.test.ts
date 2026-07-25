import {
    NewUserWatchlistLogosUseCase,
    WatchlistLogoBackfillRequest,
} from '../../../features/new_user_watchlist_logos/usecase';
import { FmpProfileService } from '../../../features/new_user_watchlist_logos/services/fmp_profile_service';
import { FirestoreService } from '../../../features/new_user_watchlist_logos/services/firestore_service';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

const USER_ID = 'user-123';

const request = (overrides: Partial<WatchlistLogoBackfillRequest> = {}): WatchlistLogoBackfillRequest => ({
    userId: USER_ID,
    tickerId: 'AAPL',
    ticker: 'AAPL',
    ...overrides
});

describe('NewUserWatchlistLogosUseCase', () => {
    let useCase: NewUserWatchlistLogosUseCase;
    let mockFmpProfileService: jest.Mocked<FmpProfileService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockFmpProfileService = {
            fetchLogoUrl: jest.fn()
        } as unknown as jest.Mocked<FmpProfileService>;
        mockFirestoreService = {
            getCachedLogoUrl: jest.fn().mockResolvedValue(null),
            setLogoUrl: jest.fn().mockResolvedValue(undefined),
            cacheLogoUrl: jest.fn().mockResolvedValue(true)
        } as unknown as jest.Mocked<FirestoreService>;
        useCase = new NewUserWatchlistLogosUseCase(mockFmpProfileService, mockFirestoreService);
    });

    it('execute_cacheHit_reusesLogoWithoutFmpCall', async () => {
        // Arrange
        mockFirestoreService.getCachedLogoUrl.mockResolvedValue('https://img/aapl.png');

        // Act
        await useCase.execute(request());

        // Assert
        expect(mockFmpProfileService.fetchLogoUrl).not.toHaveBeenCalled();
        expect(mockFirestoreService.setLogoUrl).toHaveBeenCalledWith(USER_ID, 'AAPL', 'https://img/aapl.png');
        expect(mockFirestoreService.cacheLogoUrl).not.toHaveBeenCalled();
    });

    it('execute_cacheMissFmpFound_writesItemAndCachesGlobally', async () => {
        // Arrange
        mockFirestoreService.getCachedLogoUrl.mockResolvedValue(null);
        mockFmpProfileService.fetchLogoUrl.mockResolvedValue('https://img/aapl.png');

        // Act
        await useCase.execute(request());

        // Assert
        expect(mockFmpProfileService.fetchLogoUrl).toHaveBeenCalledWith('AAPL');
        expect(mockFirestoreService.setLogoUrl).toHaveBeenCalledWith(USER_ID, 'AAPL', 'https://img/aapl.png');
        expect(mockFirestoreService.cacheLogoUrl).toHaveBeenCalledWith('AAPL', 'https://img/aapl.png');
    });

    it('execute_docIdDiffersFromTicker_writesItemByDocIdCachesByTicker', async () => {
        // Arrange
        mockFmpProfileService.fetchLogoUrl.mockResolvedValue('https://img/brkb.png');

        // Act
        await useCase.execute(request({ tickerId: 'doc-1', ticker: 'BRK.B' }));

        // Assert
        expect(mockFmpProfileService.fetchLogoUrl).toHaveBeenCalledWith('BRK.B');
        expect(mockFirestoreService.setLogoUrl).toHaveBeenCalledWith(USER_ID, 'doc-1', 'https://img/brkb.png');
        expect(mockFirestoreService.cacheLogoUrl).toHaveBeenCalledWith('BRK.B', 'https://img/brkb.png');
    });

    it('execute_cacheMissNoImageFromFmp_skipsWriteAndCache', async () => {
        // Arrange
        mockFirestoreService.getCachedLogoUrl.mockResolvedValue(null);
        mockFmpProfileService.fetchLogoUrl.mockResolvedValue(null);

        // Act
        await useCase.execute(request());

        // Assert
        expect(mockFmpProfileService.fetchLogoUrl).toHaveBeenCalledWith('AAPL');
        expect(mockFirestoreService.setLogoUrl).not.toHaveBeenCalled();
        expect(mockFirestoreService.cacheLogoUrl).not.toHaveBeenCalled();
    });

    it('execute_setLogoUrlThrows_propagatesError', async () => {
        // Arrange
        mockFmpProfileService.fetchLogoUrl.mockResolvedValue('https://img/aapl.png');
        mockFirestoreService.setLogoUrl.mockRejectedValue(new Error('write failed'));

        // Act & Assert
        await expect(useCase.execute(request())).rejects.toThrow('write failed');
    });
});
