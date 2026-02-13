import { SubscriptionCleanupUseCase } from '../../../features/subscription_cleanup/usecase';
import { FirestoreService } from '../../../core/services/subscription/firestore_service';
import { SyncUser } from '../../../core/services/subscription/dtos';
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

describe('SubscriptionCleanupUseCase', () => {
    let useCase: SubscriptionCleanupUseCase;
    let firestoreService: jest.Mocked<FirestoreService>;
    let revenueCatService: jest.Mocked<RevenueCatService>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        firestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
        revenueCatService = new RevenueCatService('test-key') as unknown as jest.Mocked<RevenueCatService>;
        useCase = new SubscriptionCleanupUseCase(firestoreService, revenueCatService);
    });

    it('execute_noUsersFound_returnsEmptyMetrics', async () => {
        // Arrange
        firestoreService.getOutOfSyncSubscribers.mockResolvedValue([]);

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(0);
        expect(revenueCatService.isUserSubscribed).not.toHaveBeenCalled();
    });

    it('execute_outOfSyncUsersFound_revocationNeeded_updatesFirestore', async () => {
        // Arrange
        const mockUsers: SyncUser[] = [
            { id: 'ghost_1', isSubscribed: true, subscriptionExpiryDate: '2025-01-01' }
        ];
        firestoreService.getOutOfSyncSubscribers.mockResolvedValue(mockUsers);
        revenueCatService.isUserSubscribed.mockResolvedValue({ active: false, expiryDate: '2025-01-01' });

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(1);
        expect(metrics.totalCorrected).toBe(1);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledWith('ghost_1', false, '2025-01-01');
    });

    it('execute_outOfSyncUsersFound_promotionNeeded_updatesFirestore', async () => {
        // Arrange
        const futureDate = '2027-01-01';
        const mockUsers: SyncUser[] = [
            { id: 'promo_1', isSubscribed: false, subscriptionExpiryDate: '2027-01-01' }
        ];
        firestoreService.getOutOfSyncSubscribers.mockResolvedValue(mockUsers);
        revenueCatService.isUserSubscribed.mockResolvedValue({ active: true, expiryDate: futureDate });

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(1);
        expect(metrics.totalCorrected).toBe(1);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledWith('promo_1', true, futureDate);
    });

    it('execute_outOfSyncUsersFound_alreadyInSync_doesNothing', async () => {
        // Arrange
        const mockUsers: SyncUser[] = [
            { id: 'user_ok', isSubscribed: true, subscriptionExpiryDate: '2027-01-01' }
        ];
        firestoreService.getOutOfSyncSubscribers.mockResolvedValue(mockUsers);
        revenueCatService.isUserSubscribed.mockResolvedValue({ active: true, expiryDate: '2027-01-01' });

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(1);
        expect(metrics.totalCorrected).toBe(0);
        expect(firestoreService.updateSubscriptionStatus).not.toHaveBeenCalled();
    });

    it('execute_mixedResults_processesAllAndReportsMetrics', async () => {
        // Arrange
        const mockUsers: SyncUser[] = [
            { id: 'user_revoke', isSubscribed: true },
            { id: 'user_ok', isSubscribed: true },
            { id: 'user_fail', isSubscribed: false }
        ];
        firestoreService.getOutOfSyncSubscribers.mockResolvedValue(mockUsers);
        revenueCatService.isUserSubscribed
            .mockResolvedValueOnce({ active: false, expiryDate: '2025-01-01' })
            .mockResolvedValueOnce({ active: true, expiryDate: '2027-01-01' })
            .mockRejectedValueOnce(new Error('API Error'));

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(3);
        expect(metrics.totalCorrected).toBe(1);
        expect(metrics.totalFailed).toBe(1);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledTimes(1);
    });

    it('execute_criticalQueryFailure_throwsError', async () => {
        // Arrange
        const mockError = new Error('DB Error');
        firestoreService.getOutOfSyncSubscribers.mockRejectedValue(mockError);

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow(mockError);
    });
});
