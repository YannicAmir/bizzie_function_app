import { FirestoreService } from '../../../../features/new_user_watchlist_logos/services/firestore_service';
import { getFirebaseAdmin } from '../../../../core/firebase';

jest.mock('../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn()
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('FirestoreService', () => {
    let service: FirestoreService;

    const mockFirestore = {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn(),
        update: jest.fn(),
        set: jest.fn()
    };

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockFirestore.collection.mockReturnThis();
        mockFirestore.doc.mockReturnThis();
        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => mockFirestore
        });
        service = new FirestoreService();
    });

    it('getCachedLogoUrl_documentHasLogo_returnsLogoUrl', async () => {
        // Arrange
        mockFirestore.get.mockResolvedValue({
            get: (field: string) => (field === 'logoUrl' ? 'https://img/aapl.png' : undefined)
        });

        // Act
        const result = await service.getCachedLogoUrl('AAPL');

        // Assert
        expect(result).toBe('https://img/aapl.png');
        expect(mockFirestore.collection).toHaveBeenCalledWith('watchlist');
        expect(mockFirestore.doc).toHaveBeenCalledWith('AAPL');
    });

    it('getCachedLogoUrl_emptyLogo_returnsNull', async () => {
        // Arrange
        mockFirestore.get.mockResolvedValue({
            get: () => ''
        });

        // Act
        const result = await service.getCachedLogoUrl('AAPL');

        // Assert
        expect(result).toBeNull();
    });

    it('getCachedLogoUrl_missingLogoField_returnsNull', async () => {
        // Arrange
        mockFirestore.get.mockResolvedValue({
            get: () => undefined
        });

        // Act
        const result = await service.getCachedLogoUrl('AAPL');

        // Assert
        expect(result).toBeNull();
    });

    it('setLogoUrl_success_updatesUserWatchlistDoc', async () => {
        // Arrange
        mockFirestore.update.mockResolvedValue(undefined);

        // Act
        await service.setLogoUrl('user-123', 'doc-1', 'https://img/aapl.png');

        // Assert
        expect(mockFirestore.collection).toHaveBeenNthCalledWith(1, 'users');
        expect(mockFirestore.doc).toHaveBeenNthCalledWith(1, 'user-123');
        expect(mockFirestore.collection).toHaveBeenNthCalledWith(2, 'watchlist');
        expect(mockFirestore.doc).toHaveBeenNthCalledWith(2, 'doc-1');
        expect(mockFirestore.update).toHaveBeenCalledWith({ logoUrl: 'https://img/aapl.png' });
    });

    it('setLogoUrl_updateFails_throwsError', async () => {
        // Arrange
        const error = new Error('write failed');
        mockFirestore.update.mockRejectedValue(error);

        // Act & Assert
        await expect(service.setLogoUrl('user-123', 'doc-1', 'https://img/aapl.png')).rejects.toThrow(error);
    });

    it('cacheLogoUrl_success_mergesLogoAndReturnsTrue', async () => {
        // Arrange
        mockFirestore.set.mockResolvedValue(undefined);

        // Act
        const result = await service.cacheLogoUrl('AAPL', 'https://img/aapl.png');

        // Assert
        expect(result).toBe(true);
        expect(mockFirestore.collection).toHaveBeenCalledWith('watchlist');
        expect(mockFirestore.doc).toHaveBeenCalledWith('AAPL');
        expect(mockFirestore.set).toHaveBeenCalledWith({ logoUrl: 'https://img/aapl.png' }, { merge: true });
    });

    it('cacheLogoUrl_setFails_returnsFalse', async () => {
        // Arrange
        mockFirestore.set.mockRejectedValue(new Error('cache failed'));

        // Act
        const result = await service.cacheLogoUrl('AAPL', 'https://img/aapl.png');

        // Assert
        expect(result).toBe(false);
    });
});
