
import { SubscriptionDripUseCase } from '../../../features/subscription_drip/usecase';
import { UserService } from '../../../features/subscription_drip/services/user_service';
import { NotificationService } from '../../../core/services/notification_service';
import { ConfigService, DripMessage } from '../../../features/subscription_drip/services/config_service';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }))
}));

describe('SubscriptionDripUseCase', () => {
    let useCase: SubscriptionDripUseCase;
    let mockUserService: jest.Mocked<UserService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
        // Arrange
        mockUserService = {
            streamRecentFreeUsers: jest.fn()
        };

        mockNotificationService = {
            sendToToken: jest.fn(),
            sendTopicNotification: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn()
        };

        mockConfigService = {
            getDripCampaign: jest.fn()
        };

        useCase = new SubscriptionDripUseCase(
            mockUserService,
            mockNotificationService,
            mockConfigService
        );
        jest.useFakeTimers().setSystemTime(new Date('2023-10-10T12:00:00Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('execute_notificationsDisabled_skipsUser', async () => {
        // Arrange
        const mockCampaign: Record<string, DripMessage> = {
            '3': { title: 'Day 3 Check-in', body: 'How is it going?' }
        };
        mockConfigService.getDripCampaign.mockResolvedValue(mockCampaign);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const user = {
            id: 'u1',
            fcmTokens: { 'd1': 't1' },
            createdAt: threeDaysAgo.toISOString(),
            isSubscribed: false,
            notificationsEnabled: false // TARGET
        };

        // Async generator mock
        async function* mockStream() {
            yield [user];
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockStream());

        // Act
        await useCase.execute();

        // Assert
        expect(mockNotificationService.sendToToken).not.toHaveBeenCalled();
    });

    it('execute_validUser_sendsToAllTokens', async () => {
        // Arrange
        const mockCampaign: Record<string, DripMessage> = {
            '3': { title: 'Welcome', body: 'Hello' }
        };
        mockConfigService.getDripCampaign.mockResolvedValue(mockCampaign);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const user = {
            id: 'u2',
            fcmTokens: { 'd1': 'tokenA', 'd2': 'tokenB' },
            createdAt: threeDaysAgo.toISOString(),
            isSubscribed: false,
            notificationsEnabled: true
        };

        async function* mockStream() {
            yield [user];
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockStream());

        // Act
        await useCase.execute();

        // Assert
        expect(mockNotificationService.sendToToken).toHaveBeenCalledTimes(2);
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith('tokenA', 'Welcome', 'Hello', expect.any(Object));
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith('tokenB', 'Welcome', 'Hello', expect.any(Object));
    });

    it('execute_deduplicateTokens_sendsOnce', async () => {
        // Arrange
        const mockCampaign: Record<string, DripMessage> = {
            '3': { title: 'Welcome', body: 'Hello' }
        };
        mockConfigService.getDripCampaign.mockResolvedValue(mockCampaign);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const user = {
            id: 'u3',
            fcmTokens: { 'd1': 'tokenA', 'd2': 'tokenA' },
            createdAt: threeDaysAgo.toISOString(),
            isSubscribed: false,
            notificationsEnabled: true
        };

        async function* mockStream() {
            yield [user];
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockStream());

        // Act
        await useCase.execute();

        // Assert
        expect(mockNotificationService.sendToToken).toHaveBeenCalledTimes(1);
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith('tokenA', 'Welcome', 'Hello', expect.any(Object));
    });

    it('execute_noMatchDay_sendsNothing', async () => {
        // Arrange
        const mockCampaign: Record<string, DripMessage> = {
            '3': { title: 'Welcome', body: 'Hello' }
        };
        mockConfigService.getDripCampaign.mockResolvedValue(mockCampaign);

        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const user = {
            id: 'u4',
            fcmTokens: { 'd1': 'tokenA' },
            createdAt: twoDaysAgo.toISOString(),
            isSubscribed: false,
            notificationsEnabled: true
        };

        async function* mockStream() {
            yield [user];
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockStream());

        // Act
        await useCase.execute();

        // Assert
        expect(mockNotificationService.sendToToken).not.toHaveBeenCalled();
    });
});
