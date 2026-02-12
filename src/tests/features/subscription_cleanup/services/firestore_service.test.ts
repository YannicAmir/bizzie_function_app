import { FirestoreService } from '../../../../features/subscription_cleanup/services/firestore_service';
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
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(),
        doc: jest.fn().mockReturnThis(),
        update: jest.fn()
    };

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();

        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => mockFirestore
        });

        service = new FirestoreService();
    });

    it('getOutOfSyncSubscribers_validData_returnsMergedUsers', async () => {
        // Arrange
        const mockGhostDocs = [
            { id: 'ghost_1', data: () => ({ isSubscribed: true, subscriptionExpiryDate: '2025-01-01' }) }
        ];
        const mockPromoDocs = [
            { id: 'promo_1', data: () => ({ isSubscribed: false, subscriptionExpiryDate: '2027-01-01' }) }
        ];

        mockFirestore.get
            .mockResolvedValueOnce({ docs: mockGhostDocs })
            .mockResolvedValueOnce({ docs: mockPromoDocs });

        // Act
        const result = await service.getOutOfSyncSubscribers(10);

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0]!.id).toBe('ghost_1');
        expect(result[1]!.id).toBe('promo_1');
        expect(mockFirestore.where).toHaveBeenCalledTimes(4);
    });

    it('getOutOfSyncSubscribers_error_throwsException', async () => {
        // Arrange
        const mockError = new Error('Firestore Error');
        mockFirestore.get.mockRejectedValue(mockError);

        // Act & Assert
        await expect(service.getOutOfSyncSubscribers()).rejects.toThrow(mockError);
    });

    it('updateSubscriptionStatus_withExpiry_updatesDocumentWithExpiry', async () => {
        // Arrange
        const userId = 'user_123';
        const isSubscribed = true;
        const expiryDate = '2027-01-01';
        mockFirestore.update.mockResolvedValue(undefined);

        // Act
        await service.updateSubscriptionStatus(userId, isSubscribed, expiryDate);

        // Assert
        expect(mockFirestore.collection).toHaveBeenCalledWith('users');
        expect(mockFirestore.doc).toHaveBeenCalledWith(userId);
        expect(mockFirestore.update).toHaveBeenCalledWith(expect.objectContaining({
            isSubscribed,
            subscriptionExpiryDate: expiryDate,
            updatedAt: expect.any(String)
        }));
    });

    it('updateSubscriptionStatus_withoutExpiry_updatesDocumentWithoutExpiry', async () => {
        // Arrange
        const userId = 'user_456';
        const isSubscribed = false;
        mockFirestore.update.mockResolvedValue(undefined);

        // Act
        await service.updateSubscriptionStatus(userId, isSubscribed);

        // Assert
        expect(mockFirestore.update).toHaveBeenCalledWith({
            isSubscribed,
            updatedAt: expect.any(String)
        });
    });

    it('updateSubscriptionStatus_error_throwsException', async () => {
        // Arrange
        const mockError = new Error('Update Failed');
        mockFirestore.update.mockRejectedValue(mockError);

        // Act & Assert
        await expect(service.updateSubscriptionStatus('u1', false)).rejects.toThrow(mockError);
    });
});
