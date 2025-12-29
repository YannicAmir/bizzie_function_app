import { UserSubscriptionSyncUseCase, User } from '../../../../src/features/user_subscription_sync/usecase';
import { FirestoreService } from '../../../../src/features/user_subscription_sync/services/firestore_service';
import { NotificationService } from '../../../../src/core/services/notification_service';

describe('UserSubscriptionSyncUseCase', () => {
    let useCase: UserSubscriptionSyncUseCase;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockFirestoreService: jest.Mocked<FirestoreService>;

    beforeEach(() => {
        mockNotificationService = {
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn()
        };

        mockFirestoreService = {
            removeStaleToken: jest.fn()
        } as unknown as jest.Mocked<FirestoreService>;

        useCase = new UserSubscriptionSyncUseCase(mockNotificationService, mockFirestoreService);
    });

    // Helper Objects
    const userSubscribed = (id: string, token: string, subscribed: boolean = true): User => ({
        id,
        isSubscribed: subscribed,
        fcmTokens: { 'dev1': token }
    });

    it('should_doNothing_when_statusAndTokensUnchanged', async () => {
        const user = userSubscribed('u1', 'tok1');
        await useCase.execute(user, user);

        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalled();
        expect(mockNotificationService.unsubscribeFromTopic).not.toHaveBeenCalled();
    });

    it('should_doNothing_when_keysShuffled_butContentSame', async () => {
        // user A: { "dev1": "tok1", "dev2": "tok2" }
        const before: User = {
            id: 'u1',
            isSubscribed: true,
            fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' }
        };
        // user B: { "dev2": "tok2", "dev1": "tok1" } (Shuffled)
        const after: User = {
            id: 'u1',
            isSubscribed: true,
            fcmTokens: { 'dev2': 'tok2', 'dev1': 'tok1' }
        };

        await useCase.execute(before, after);

        // Verification: If isEqual works, this returns early.
        // If it was JSON.stringify, it would fail string equality, proceed, and likely try to subscribe again.
        // Since logic is idempotent, it wouldn't break, but we want to ensure it DOES NOT call anything.
        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalled();
    });

    it('should_subscribeTokens_when_userBecomesSubscribed', async () => {
        const before = userSubscribed('u1', 'tok1', false); // Not subscribed
        const after = userSubscribed('u1', 'tok1', true);   // Now subscribed

        await useCase.execute(before, after);

        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
    });

    it('should_unsubscribeTokens_when_userUnsubscribes', async () => {
        const before = userSubscribed('u1', 'tok1', true);
        const after = userSubscribed('u1', 'tok1', false);

        await useCase.execute(before, after);

        // Should attempt to unsubscribe the token
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
    });

    it('should_subscribeNewTokens_when_tokenAddedThinkingSubscribed', async () => {
        const before: User = { id: 'u1', isSubscribed: true, fcmTokens: { 'dev1': 'tok1' } };
        // Added dev2
        const after: User = { id: 'u1', isSubscribed: true, fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' } };

        await useCase.execute(before, after);

        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok2', 'premium_notifications');
        // 'tok1' unchanged, so usually we skip re-subscribing unless we wanted to be idempotent
        // Logic check: "if (wasNotSubscribed || isNewToken)" -> tok1 is not new, wasNotSubscribed is false. So tok1 skipped.
        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalledWith('tok1', expect.anything());
    });

    it('should_unsubscribeRemovedTokens_when_userIsSubscribed', async () => {
        const before: User = { id: 'u1', isSubscribed: true, fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' } };
        // Removed dev2
        const after: User = { id: 'u1', isSubscribed: true, fcmTokens: { 'dev1': 'tok1' } };

        await useCase.execute(before, after);

        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok2', 'premium_notifications');
    });

    it('should_removeStaleToken_when_subscribeFailsWithSpecificError', async () => {
        const before = userSubscribed('u1', 'tok1', false);
        const after = userSubscribed('u1', 'tok1', true);

        // Mock error that looks like a stale token error
        const staleError = {
            code: 'messaging/registration-token-not-registered',
            message: 'Not found'
        };
        mockNotificationService.subscribeToTopic.mockRejectedValue(staleError);

        await useCase.execute(before, after);

        expect(mockFirestoreService.removeStaleToken).toHaveBeenCalledWith('u1', 'dev1');
    });

    it('should_ignoreError_when_unsubscribeFails', async () => {
        const before = userSubscribed('u1', 'tok1', true);
        const after = userSubscribed('u1', 'tok1', false);

        mockNotificationService.unsubscribeFromTopic.mockRejectedValue(new Error('Random fail'));

        // Should not throw
        await useCase.execute(before, after);
    });

    it('should_unsubscribeAllTokens_when_cleanupUserCalled', async () => {
        const user: User = {
            id: 'u1',
            isSubscribed: true,
            fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' }
        };

        await useCase.cleanupUser(user);

        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok2', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledTimes(2);
    });
});
