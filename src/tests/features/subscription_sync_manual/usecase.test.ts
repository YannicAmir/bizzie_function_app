import { ManualSyncUseCase } from '../../../features/subscription_sync_manual/usecase';
import { FirestoreService } from '../../../core/services/subscription/firestore_service';
import { RevenueCatService } from '../../../core/services/subscription/revenuecat_service';

jest.mock('../../../core/services/subscription/firestore_service');
jest.mock('../../../core/services/subscription/revenuecat_service');

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('ManualSyncUseCase', () => {
    let useCase: ManualSyncUseCase;
    let firestoreService: jest.Mocked<FirestoreService>;
    let revenueCatService: jest.Mocked<RevenueCatService>;
    const userId = 'user_123';

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        firestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
        revenueCatService = new RevenueCatService('test-key') as unknown as jest.Mocked<RevenueCatService>;
        useCase = new ManualSyncUseCase(firestoreService, revenueCatService);
    });

    it('execute_validUserActive_updatesFirestoreAndReturnsResult', async () => {
        // Arrange
        const mockRcStatus = { active: true, expiryDate: '2027-01-01' };
        revenueCatService.isUserSubscribed.mockResolvedValue(mockRcStatus);

        // Act
        const result = await useCase.execute(userId);

        // Assert
        expect(revenueCatService.isUserSubscribed).toHaveBeenCalledWith(userId);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledWith(
            userId,
            mockRcStatus.active,
            mockRcStatus.expiryDate
        );
        expect(result.active).toBe(true);
        expect(result.expiryDate).toBe(mockRcStatus.expiryDate);
    });

    it('execute_validUserInactive_updatesFirestoreAndReturnsResult', async () => {
        // Arrange
        const mockRcStatus = { active: false, expiryDate: '2025-01-01' };
        revenueCatService.isUserSubscribed.mockResolvedValue(mockRcStatus);

        // Act
        const result = await useCase.execute(userId);

        // Assert
        expect(revenueCatService.isUserSubscribed).toHaveBeenCalledWith(userId);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledWith(
            userId,
            mockRcStatus.active,
            mockRcStatus.expiryDate
        );
        expect(result.active).toBe(false);
        expect(result.expiryDate).toBe(mockRcStatus.expiryDate);
    });

    it('execute_serviceFailure_throwsError', async () => {
        // Arrange
        const mockError = new Error('API Failure');
        revenueCatService.isUserSubscribed.mockRejectedValue(mockError);

        // Act & Assert
        await expect(useCase.execute(userId)).rejects.toThrow(mockError);
    });
});
