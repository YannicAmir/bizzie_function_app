import { GlobalWatchlistService } from '../../../../features/watchlist_aggregator/services/global_watchlist_service';
import { getFirebaseAdmin } from '../../../../core/firebase';

// Mock dependencies
jest.mock('../../../../core/firebase');
jest.mock('../../../../core/logger');

describe('GlobalWatchlistService', () => {
    let service: GlobalWatchlistService;
    let mockFirestore: { collection: jest.Mock };
    let mockCollection: { doc: jest.Mock };
    let mockDoc: { set: jest.Mock };

    beforeEach(() => {
        mockDoc = {
            set: jest.fn().mockResolvedValue({}),
        };
        mockCollection = {
            doc: jest.fn().mockReturnValue(mockDoc),
        };
        mockFirestore = {
            collection: jest.fn().mockReturnValue(mockCollection),
        };

        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => mockFirestore,
        });

        service = new GlobalWatchlistService();
    });

    it('globalWatchlistService_upsertToGlobalList_callsFirestoreSetWithMerge', async () => {
        // Arrange
        const ticker = 'NVDA';
        const companyName = 'NVIDIA';
        const logoUrl = 'https://images.financialmodelingprep.com/symbol/NVDA.png';

        // Act
        await service.upsertToGlobalList(ticker, companyName, logoUrl);

        // Assert
        expect(mockFirestore.collection).toHaveBeenCalledWith('watchlist');
        expect(mockCollection.doc).toHaveBeenCalledWith(ticker);
        expect(mockDoc.set).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker,
                companyName,
                logoUrl,
                lastAddedAt: expect.anything(), // FieldValue.serverTimestamp() matches anything in mock
            }),
            { merge: true }
        );
    });

    it('globalWatchlistService_upsertToGlobalList_missingLogoUrl_omitsLogoUrlField', async () => {
        // Arrange
        const ticker = 'NVDA';
        const companyName = 'NVIDIA';

        // Act
        await service.upsertToGlobalList(ticker, companyName, '');

        // Assert
        expect(mockDoc.set).toHaveBeenCalledWith(
            expect.not.objectContaining({ logoUrl: expect.anything() }),
            { merge: true }
        );
    });

    it('globalWatchlistService_upsertToGlobalList_throwsOnFirestoreError', async () => {
        // Arrange
        const ticker = 'NVDA';
        mockDoc.set.mockRejectedValue(new Error('Firestore unavailable'));

        // Act & Assert
        await expect(service.upsertToGlobalList(ticker, 'Name', '')).rejects.toThrow('Firestore unavailable');
    });
});
