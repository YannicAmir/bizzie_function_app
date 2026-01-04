import { FirebaseWatchlistService } from '../../../core/services/watchlist_service';
import * as firebaseCore from '../../../core/firebase';

jest.mock('../../../core/firebase');
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('FirebaseWatchlistService', () => {
    let service: FirebaseWatchlistService;
    let mockGet: jest.Mock;
    let mockCollection: jest.Mock;

    beforeEach(() => {
        service = new FirebaseWatchlistService();
        mockGet = jest.fn();
        mockCollection = jest.fn().mockReturnValue({ get: mockGet });

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: mockCollection
            })
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('getAllWatchedTickers_hasDocs_returnsTickerMap', async () => {
        // Arrange
        const mockDocs = [
            { id: 'AAPL', data: () => ({ companyName: 'Apple Inc.' }) },
            { id: 'GOOG', data: () => ({ name: 'Alphabet' }) },
            { id: 'TSLA', data: () => ({}) }
        ];

        mockGet.mockResolvedValue({
            empty: false,
            forEach: (callback: (doc: { id: string; data: () => unknown }) => void) => mockDocs.forEach(callback),
            size: 3
        });

        // Act
        const result = await service.getAllWatchedTickers();

        // Assert
        expect(result.size).toBe(3);
        expect(result.get('AAPL')).toBe('Apple Inc.');
        expect(result.get('GOOG')).toBe('Alphabet');
        expect(result.get('TSLA')).toBe('TSLA'); // Fallback

        expect(mockCollection).toHaveBeenCalledWith('watchlist');
    });

    it('getAllWatchedTickers_empty_returnsEmptyMap', async () => {
        // Arrange
        mockGet.mockResolvedValue({
            empty: true,
            forEach: jest.fn(),
            size: 0
        });

        // Act
        const result = await service.getAllWatchedTickers();

        // Assert
        expect(result.size).toBe(0);
    });

    it('getAllWatchedTickers_firestoreError_throws', async () => {
        // Arrange
        mockGet.mockRejectedValue(new Error('Firestore Down'));

        // Act & Assert
        await expect(service.getAllWatchedTickers())
            .rejects.toThrow('Firestore Down');
    });
});
