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

    const userSubscribed = (id: string, token: string, subscribed: boolean = true, notificationsEnabled: boolean = true): User => ({
        id,
        isSubscribed: subscribed,
        notificationsEnabled,
        fcmTokens: { 'dev1': token }
    });

    it('should_doNothing_when_statusAndTokensUnchanged', async () => {
        // Arrange
        const user = userSubscribed('u1', 'tok1');

        // Act
        await useCase.execute(user, user);

        // Assert
        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalled();
        expect(mockNotificationService.unsubscribeFromTopic).not.toHaveBeenCalled();
    });

    it('should_doNothing_when_keysShuffled_butContentSame', async () => {
        // Arrange
        const before: User = {
            id: 'u1',
            isSubscribed: true,
            notificationsEnabled: true,
            fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' }
        };
        const after: User = {
            id: 'u1',
            isSubscribed: true,
            notificationsEnabled: true,
            fcmTokens: { 'dev2': 'tok2', 'dev1': 'tok1' }
        };

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalled();
    });

    it('should_subscribePremium_unsubscribeBasic_when_userBecomesSubscribed', async () => {
        // Arrange
        const before = userSubscribed('u1', 'tok1', false);
        const after = userSubscribed('u1', 'tok1', true);

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
    });

    it('should_subscribeBasic_unsubscribePremium_when_userUnsubscribes', async () => {
        // Arrange
        const before = userSubscribed('u1', 'tok1', true);
        const after = userSubscribed('u1', 'tok1', false);

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
    });

    it('should_subscribeBasic_when_newUserCreated', async () => {
        // Arrange
        const before: User = { id: 'u1', isSubscribed: false, notificationsEnabled: true, fcmTokens: {} };
        const after: User = { id: 'u1', isSubscribed: false, notificationsEnabled: true, fcmTokens: { 'dev1': 'tok1' } };

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).not.toHaveBeenCalled();
    });

    it('should_subscribeNewTokens_toPremium_when_alreadyPremium', async () => {
        // Arrange
        const before: User = { id: 'u1', isSubscribed: true, notificationsEnabled: true, fcmTokens: { 'dev1': 'tok1' } };
        const after: User = { id: 'u1', isSubscribed: true, notificationsEnabled: true, fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' } };

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok2', 'premium_notifications');
        expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalledWith('tok1', expect.anything());
    });

    it('should_unsubscribeRemovedTokens_fromBoth_when_tokenRemoved', async () => {
        // Arrange
        const before: User = { id: 'u1', isSubscribed: true, notificationsEnabled: true, fcmTokens: { 'dev1': 'tok1' } };
        const after: User = { id: 'u1', isSubscribed: true, notificationsEnabled: true, fcmTokens: {} };

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
    });

    it('should_removeStaleToken_when_subscribeFailsWithSpecificError', async () => {
        // Arrange
        const before = userSubscribed('u1', 'tok1', false);
        const after = userSubscribed('u1', 'tok1', true);

        const staleError = {
            code: 'messaging/registration-token-not-registered',
            message: 'Not found'
        };
        mockNotificationService.subscribeToTopic.mockRejectedValue(staleError);

        // Act
        await useCase.execute(before, after);

        // Assert
        expect(mockFirestoreService.removeStaleToken).toHaveBeenCalledWith('u1', 'dev1');
    });

    it('should_ignoreError_when_unsubscribeFails', async () => {
        // Arrange
        const before = userSubscribed('u1', 'tok1', true);
        const after = userSubscribed('u1', 'tok1', false);

        mockNotificationService.unsubscribeFromTopic.mockRejectedValue(new Error('Random fail'));

        // Act
        await useCase.execute(before, after);

        // Assert (No error thrown)
    });

    it('should_unsubscribeAllTokens_when_cleanupUserCalled', async () => {
        // Arrange
        const user: User = {
            id: 'u1',
            isSubscribed: true,
            notificationsEnabled: true,
            fcmTokens: { 'dev1': 'tok1', 'dev2': 'tok2' }
        };

        // Act
        await useCase.cleanupUser(user);

        // Assert
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok2', 'premium_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok2', 'basic_notifications');
        expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledTimes(4);
    });

    describe('Notification Toggle Logic', () => {
        it('should_unsubscribeFromAllTopics_when_notificationsDisabled', async () => {
            // Arrange
            const before = userSubscribed('u1', 'tok1', true, true);
            const after = userSubscribed('u1', 'tok1', true, false);

            // Act
            await useCase.execute(before, after);

            // Assert
            expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
            expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
        });

        it('should_subscribeToCorrectTopic_when_notificationsEnabled', async () => {
            // Arrange
            const before = userSubscribed('u1', 'tok1', true, false);
            const after = userSubscribed('u1', 'tok1', true, true);

            // Act
            await useCase.execute(before, after);

            // Assert
            expect(mockNotificationService.subscribeToTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
            expect(mockNotificationService.unsubscribeFromTopic).not.toHaveBeenCalled();
        });

        it('should_doNothing_when_newTokensAddedWhileDisabled', async () => {
            // Arrange
            const before: User = { id: 'u1', isSubscribed: true, notificationsEnabled: false, fcmTokens: {} };
            const after: User = { id: 'u1', isSubscribed: true, notificationsEnabled: false, fcmTokens: { 'dev1': 'tok1' } };

            // Act
            await useCase.execute(before, after);

            // Assert
            // It should actually try to unsubscribe to be safe (idempotency), but not subscribe
            expect(mockNotificationService.subscribeToTopic).not.toHaveBeenCalled();
            expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'premium_notifications');
            expect(mockNotificationService.unsubscribeFromTopic).toHaveBeenCalledWith('tok1', 'basic_notifications');
        });
    });
});
