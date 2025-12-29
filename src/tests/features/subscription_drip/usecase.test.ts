import { SubscriptionDripUseCase } from '../../../features/subscription_drip/usecase';
import { UserService, User } from '../../../features/subscription_drip/services/user_service';
import { NotificationService } from '../../../core/services/notification_service';
import { ConfigService, DripMessage } from '../../../features/subscription_drip/services/config_service';

// Mock Logger
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('SubscriptionDripUseCase', () => {
    let useCase: SubscriptionDripUseCase;
    let mockUserService: jest.Mocked<UserService>;
    let mockNotificationService: jest.Mocked<NotificationService>;
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
        mockUserService = {
            streamRecentFreeUsers: jest.fn()
        };
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };
        mockConfigService = {
            getDripCampaign: jest.fn()
        };

        useCase = new SubscriptionDripUseCase(
            mockUserService,
            mockNotificationService,
            mockConfigService
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it('sends notifications based on config mapping', async () => {
        // Mock Config
        const mockCampaign: Record<number, DripMessage> = {
            1: { title: 'Day 1', body: 'Body 1' },
            2: { title: 'Day 2', body: 'Body 2' }, // New Day 2
            7: { title: 'Day 7', body: 'Body 7' }
        };
        mockConfigService.getDripCampaign.mockResolvedValue(mockCampaign);

        // Mock "Today" as 2023-10-10 12:00 UTC
        const mockNow = new Date('2023-10-10T12:00:00Z');
        jest.useFakeTimers().setSystemTime(mockNow);

        // Helper to create date strings X days ago
        const daysAgo = (n: number) => {
            const d = new Date(mockNow);
            d.setDate(d.getDate() - n);
            return d.toISOString();
        };

        const mockUsers: User[] = [
            { id: 'u1', fcmToken: 't1', isSubscribed: false, createdAt: daysAgo(1) }, // Day 1 -> Send
            { id: 'u2', fcmToken: 't2', isSubscribed: false, createdAt: daysAgo(2) }, // Day 2 -> Send (Dynamic)
            { id: 'u3', fcmToken: 't3', isSubscribed: false, createdAt: daysAgo(7) }, // Day 7 -> Send
            { id: 'u4', fcmToken: 't4', isSubscribed: false, createdAt: daysAgo(8) }, // Day 8 -> Skip (Not in config)
        ];

        // Generator mock
        async function* mockGenerator() {
            yield mockUsers;
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockGenerator());

        await useCase.execute();

        // Verify calls
        expect(mockNotificationService.sendToToken).toHaveBeenCalledTimes(3);

        // Day 1
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith(
            't1', 'Day 1', 'Body 1', expect.any(Object)
        );
        // Day 2 (New)
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith(
            't2', 'Day 2', 'Body 2', expect.any(Object)
        );
        // Day 7
        expect(mockNotificationService.sendToToken).toHaveBeenCalledWith(
            't3', 'Day 7', 'Body 7', expect.any(Object)
        );
    });

    it('handles pagination (multiple batches)', async () => {
        mockConfigService.getDripCampaign.mockResolvedValue({ 1: { title: 'T', body: 'B' } });

        const mockNow = new Date('2023-10-10T12:00:00Z');
        jest.useFakeTimers().setSystemTime(mockNow);

        const batch1 = [{ id: 'u1', fcmToken: 't1', isSubscribed: false, createdAt: new Date(mockNow.getTime() - 24 * 60 * 60 * 1000).toISOString() } as User]; // Day 1
        const batch2 = [{ id: 'u2', fcmToken: 't2', isSubscribed: false, createdAt: new Date(mockNow.getTime() - 24 * 60 * 60 * 1000).toISOString() } as User]; // Day 1 again

        async function* mockGenerator() {
            yield batch1;
            yield batch2;
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockGenerator());

        await useCase.execute();

        expect(mockNotificationService.sendToToken).toHaveBeenCalledTimes(2);
    });

    it('skips users without tokens or createdAt', async () => {
        mockConfigService.getDripCampaign.mockResolvedValue({});
        async function* mockGenerator() {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            yield [{ id: 'u1', isSubscribed: false } as any]; // Missing fields
        }
        mockUserService.streamRecentFreeUsers.mockReturnValue(mockGenerator());

        await useCase.execute();
        expect(mockNotificationService.sendToToken).not.toHaveBeenCalled();
    });
});
