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

    it('getGhostSubscribers_success_returnsMappedGhostUsers', async () => {
        // Arrange
        const mockDocs = [
            { id: 'user_1', data: () => ({ isSubscribed: true, subscriptionExpiryDate: '2025-01-01' }) },
            { id: 'user_2', data: () => ({ isSubscribed: true, subscriptionExpiryDate: '2025-01-02' }) }
        ];

        mockFirestore.get.mockResolvedValue({
            docs: mockDocs
        });

        // Act
        const result = await service.getGhostSubscribers(10);

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 'user_1', isSubscribed: true, subscriptionExpiryDate: '2025-01-01' });
        expect(mockFirestore.collection).toHaveBeenCalledWith('users');
        expect(mockFirestore.where).toHaveBeenCalledWith('isSubscribed', '==', true);
        expect(mockFirestore.limit).toHaveBeenCalledWith(10);
    });

    it('getGhostSubscribers_failure_throwsAndLogs', async () => {
        // Arrange
        const mockError = new Error('Firestore Error');
        mockFirestore.get.mockRejectedValue(mockError);

        // Act & Assert
        await expect(service.getGhostSubscribers()).rejects.toThrow(mockError);
    });

    it('updateSubscriptionStatus_success_updatesDocument', async () => {
        // Arrange
        const userId = 'user_123';
        const isSubscribed = false;
        mockFirestore.update.mockResolvedValue(undefined);

        // Act
        await service.updateSubscriptionStatus(userId, isSubscribed);

        // Assert
        expect(mockFirestore.collection).toHaveBeenCalledWith('users');
        expect(mockFirestore.doc).toHaveBeenCalledWith(userId);
        expect(mockFirestore.update).toHaveBeenCalledWith(expect.objectContaining({
            isSubscribed,
            updatedAt: expect.any(String)
        }));
    });

    it('updateSubscriptionStatus_failure_throwsAndLogs', async () => {
        // Arrange
        const mockError = new Error('Update Error');
        mockFirestore.update.mockRejectedValue(mockError);

        // Act & Assert
        await expect(service.updateSubscriptionStatus('u1', false)).rejects.toThrow(mockError);
    });
});
