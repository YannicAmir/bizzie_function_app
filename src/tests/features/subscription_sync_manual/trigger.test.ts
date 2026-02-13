import { syncUserSubscription } from '../../../features/subscription_sync_manual/trigger';
import { ManualSyncUseCase } from '../../../features/subscription_sync_manual/usecase';
import { CallableRequest } from 'firebase-functions/v2/https';
import { FirestoreService } from '../../../core/services/subscription/firestore_service';
import { RevenueCatService } from '../../../core/services/subscription/revenuecat_service';

jest.mock('../../../features/subscription_sync_manual/usecase');
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

describe('ManualSyncTrigger', () => {
    let mockUseCase: jest.Mocked<ManualSyncUseCase>;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockUseCase = new ManualSyncUseCase({} as FirestoreService, {} as RevenueCatService) as jest.Mocked<ManualSyncUseCase>;
        (ManualSyncUseCase as jest.Mock).mockImplementation(() => mockUseCase);
    });

    it('syncUserSubscription_unauthenticated_throwsHttpsError', async () => {
        // Arrange
        const mockRequest = {
            auth: undefined
        } as unknown as CallableRequest<void>;

        // Act & Assert
        try {
            await (syncUserSubscription.run as (req: CallableRequest<void>) => Promise<unknown>)(mockRequest);
            fail('Should have thrown an error');
        } catch (error: unknown) {
            // Assert
            const httpsError = error as { code: string };
            expect(httpsError.code).toBe('unauthenticated');
        }
    });

    it('syncUserSubscription_authenticatedSuccess_returnsSyncResult', async () => {
        // Arrange
        const userId = 'user_123';
        const mockRequest = {
            auth: { uid: userId }
        } as unknown as CallableRequest<void>;

        const mockResult = { active: true, expiryDate: '2027-01-01' };
        mockUseCase.execute.mockResolvedValue(mockResult);

        // Act
        const result = await (syncUserSubscription.run as (req: CallableRequest<void>) => Promise<unknown>)(mockRequest);

        // Assert
        expect(mockUseCase.execute).toHaveBeenCalledWith(userId);
        expect(result).toEqual({
            success: true,
            active: mockResult.active,
            expiryDate: mockResult.expiryDate
        });
    });

    it('syncUserSubscription_useCaseFailure_throwsHttpsError', async () => {
        // Arrange
        const userId = 'user_123';
        const mockRequest = {
            auth: { uid: userId }
        } as unknown as CallableRequest<void>;

        mockUseCase.execute.mockRejectedValue(new Error('Logic Failure'));

        // Act & Assert
        try {
            await (syncUserSubscription.run as (req: CallableRequest<void>) => Promise<unknown>)(mockRequest);
            fail('Should have thrown an error');
        } catch (error: unknown) {
            // Assert
            const httpsError = error as { code: string };
            expect(httpsError.code).toBe('internal');
        }
    });
});
