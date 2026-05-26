import { RetrievalSchedulerUsecase, DeliveryProcessorUsecase } from '../../../../features/weekly_recap/retrieval_and_messaging/usecase';
import type { UserRecord, WeeklySummary, EligibleUser } from '../../../../features/weekly_recap/retrieval_and_messaging/models';

jest.mock('../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn().mockReturnValue({
        firestore: jest.fn().mockReturnValue({ collection: jest.fn(), collectionGroup: jest.fn() }),
        messaging: jest.fn().mockReturnValue({ sendEachForMulticast: jest.fn() }),
    }),
}));

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({})));

jest.mock('@google-cloud/pubsub', () => ({
    PubSub: jest.fn().mockImplementation(() => ({ topic: jest.fn() })),
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    })),
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

describe('RetrievalSchedulerUsecase', () => {
    let usecase: RetrievalSchedulerUsecase;
    let mockFirestoreService: { retrieveEligibleUsers: jest.Mock; retrieveSummariesForWeek: jest.Mock };
    let mockRedisService: { storeUsers: jest.Mock };
    let mockPubSubService: { queueSummaries: jest.Mock };

    beforeEach(() => {
        // Arrange
        jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:00:00Z'));
        jest.clearAllMocks();

        mockFirestoreService = {
            retrieveEligibleUsers: jest.fn(),
            retrieveSummariesForWeek: jest.fn(),
        };
        mockRedisService = {
            storeUsers: jest.fn(),
        };
        mockPubSubService = {
            queueSummaries: jest.fn(),
        };

        usecase = new RetrievalSchedulerUsecase(
            mockFirestoreService as never,
            mockRedisService as never,
            mockPubSubService as never,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('execute_noEligibleUsers_returnsEarlyWithoutStoringOrQueuing', async () => {
        // Arrange
        mockFirestoreService.retrieveEligibleUsers.mockResolvedValue([]);

        // Act
        await usecase.execute();

        // Assert
        expect(mockRedisService.storeUsers).not.toHaveBeenCalled();
        expect(mockFirestoreService.retrieveSummariesForWeek).not.toHaveBeenCalled();
        expect(mockPubSubService.queueSummaries).not.toHaveBeenCalled();
    });

    it('execute_withEligibleUsers_storesUsersAndQueuesSummaries', async () => {
        // Arrange
        const users: UserRecord[] = [
            { uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL', 'MSFT'] },
            { uid: 'user2', fcmTokens: ['token2'], tickers: ['AAPL'] },
        ];
        const summaries: WeeklySummary[] = [
            { ticker: 'AAPL', companyName: 'Apple Inc.', weekEndDate: '2026-05-25', messageTitle: 'AAPL Weekly', messageShortSummary: 'Great week' },
        ];
        mockFirestoreService.retrieveEligibleUsers.mockResolvedValue(users);
        mockFirestoreService.retrieveSummariesForWeek.mockResolvedValue(summaries);
        mockRedisService.storeUsers.mockResolvedValue(undefined);
        mockPubSubService.queueSummaries.mockResolvedValue(undefined);

        // Act
        await usecase.execute();

        // Assert
        expect(mockRedisService.storeUsers).toHaveBeenCalledWith(users);
        expect(mockFirestoreService.retrieveSummariesForWeek).toHaveBeenCalledWith('2026-05-25');
        expect(mockPubSubService.queueSummaries).toHaveBeenCalledWith(summaries);
    });

    it('execute_retrieveUsersFails_propagatesError', async () => {
        // Arrange
        mockFirestoreService.retrieveEligibleUsers.mockRejectedValue(new Error('Firestore unavailable'));

        // Act & Assert
        await expect(usecase.execute()).rejects.toThrow('Firestore unavailable');
    });

    it('execute_storUsersFails_propagatesError', async () => {
        // Arrange
        const users: UserRecord[] = [{ uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL'] }];
        mockFirestoreService.retrieveEligibleUsers.mockResolvedValue(users);
        mockRedisService.storeUsers.mockRejectedValue(new Error('Redis unavailable'));

        // Act & Assert
        await expect(usecase.execute()).rejects.toThrow('Redis unavailable');
    });
});

describe('DeliveryProcessorUsecase', () => {
    let usecase: DeliveryProcessorUsecase;
    let mockRedisService: { claimUsersForTicker: jest.Mock };
    let mockFcmService: { sendNotifications: jest.Mock };

    const message: WeeklySummary = {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        weekEndDate: '2026-05-25',
        messageTitle: 'AAPL Weekly',
        messageShortSummary: 'Strong week across the board',
    };

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();

        mockRedisService = {
            claimUsersForTicker: jest.fn(),
        };
        mockFcmService = {
            sendNotifications: jest.fn(),
        };

        usecase = new DeliveryProcessorUsecase(
            mockRedisService as never,
            mockFcmService as never,
        );
    });

    it('execute_noUsersForTicker_doesNotSendNotifications', async () => {
        // Arrange
        mockRedisService.claimUsersForTicker.mockResolvedValue([]);

        // Act
        await usecase.execute(message);

        // Assert
        expect(mockFcmService.sendNotifications).not.toHaveBeenCalled();
    });

    it('execute_withEligibleUsers_sendsNotifications', async () => {
        // Arrange
        const users: EligibleUser[] = [
            { uid: 'user1', fcmTokens: ['token1', 'token2'] },
        ];
        mockRedisService.claimUsersForTicker.mockResolvedValue(users);
        mockFcmService.sendNotifications.mockResolvedValue(undefined);

        // Act
        await usecase.execute(message);

        // Assert
        expect(mockRedisService.claimUsersForTicker).toHaveBeenCalledWith('AAPL');
        expect(mockFcmService.sendNotifications).toHaveBeenCalledWith(users, message);
    });

    it('execute_redisThrows_catchesErrorAndReturnsWithoutThrowing', async () => {
        // Arrange
        mockRedisService.claimUsersForTicker.mockRejectedValue(new Error('Redis connection lost'));

        // Act
        await usecase.execute(message);

        // Assert
        expect(mockFcmService.sendNotifications).not.toHaveBeenCalled();
    });
});
