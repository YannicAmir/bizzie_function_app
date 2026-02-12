import { SubscriptionCleanupUseCase } from '../../../features/subscription_cleanup/usecase';
import { FirestoreService, GhostUser } from '../../../features/subscription_cleanup/services/firestore_service';
import { RevenueCatService } from '../../../features/subscription_cleanup/services/revenuecat_service';

jest.mock('../../../features/subscription_cleanup/services/firestore_service');
jest.mock('../../../features/subscription_cleanup/services/revenuecat_service');

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
        revenueCatService = new RevenueCatService() as jest.Mocked<RevenueCatService>;
        useCase = new SubscriptionCleanupUseCase(firestoreService, revenueCatService);
    });

    it('execute_noGhostsFound_skipsVerification', async () => {
        // Arrange
        firestoreService.getGhostSubscribers.mockResolvedValue([]);

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(0);
        expect(revenueCatService.isUserSubscribed).not.toHaveBeenCalled();
    });

    it('execute_ghostsFound_allExpired_correctsAll', async () => {
        // Arrange
        const mockGhosts: GhostUser[] = [
            { id: 'user_1', isSubscribed: true },
            { id: 'user_2', isSubscribed: true }
        ];
        firestoreService.getGhostSubscribers.mockResolvedValue(mockGhosts);
        revenueCatService.isUserSubscribed.mockResolvedValue(false);

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(2);
        expect(metrics.totalCorrected).toBe(2);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledTimes(2);
    });

    it('execute_ghostsFound_someActive_skipsActive', async () => {
        // Arrange
        const mockGhosts: GhostUser[] = [
            { id: 'user_expired', isSubscribed: true },
            { id: 'user_active', isSubscribed: true }
        ];
        firestoreService.getGhostSubscribers.mockResolvedValue(mockGhosts);
        revenueCatService.isUserSubscribed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(2);
        expect(metrics.totalCorrected).toBe(1);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledWith('user_expired', false);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledTimes(1);
    });

    it('execute_ghostsFound_oneFailure_continuesRemaining', async () => {
        // Arrange
        const mockGhosts: GhostUser[] = [
            { id: 'user_1', isSubscribed: true },
            { id: 'user_failed', isSubscribed: true },
            { id: 'user_2', isSubscribed: true }
        ];
        firestoreService.getGhostSubscribers.mockResolvedValue(mockGhosts);
        revenueCatService.isUserSubscribed.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('API Failure')).mockResolvedValueOnce(false);

        // Act
        const metrics = await useCase.execute();

        // Assert
        expect(metrics.totalScanned).toBe(3);
        expect(metrics.totalCorrected).toBe(2);
        expect(metrics.totalFailed).toBe(1);
        expect(firestoreService.updateSubscriptionStatus).toHaveBeenCalledTimes(2);
    });

    it('execute_criticalFailure_throws', async () => {
        // Arrange
        const mockError = new Error('Database down');
        firestoreService.getGhostSubscribers.mockRejectedValue(mockError);

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow(mockError);
    });
});
