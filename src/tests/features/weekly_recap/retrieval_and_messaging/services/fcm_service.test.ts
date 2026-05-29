import { FcmService } from '../../../../../features/weekly_recap/retrieval_and_messaging/services/fcm_service';
import type { EligibleUser, WeeklySummary } from '../../../../../features/weekly_recap/retrieval_and_messaging/models';

let mockSendEachForMulticast: jest.Mock;

jest.mock('../../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn().mockReturnValue({
        messaging: jest.fn().mockReturnValue({
            sendEachForMulticast: (...args: unknown[]) => mockSendEachForMulticast?.(...args),
        }),
    }),
}));

jest.mock('../../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    })),
}));

jest.mock('../../../../../core/retry', () => ({
    retry: jest.fn((fn: () => unknown) => fn()),
}));

const summary: WeeklySummary = {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    weekEndDate: '2026-05-25',
    messageTitle: 'AAPL Weekly Recap',
    messageShortSummary: 'Strong performance this week.',
};

describe('FcmService', () => {
    let service: FcmService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockSendEachForMulticast = jest.fn();
        service = new FcmService();
    });

    describe('sendNotifications', () => {
        it('sendNotifications_withUsers_callsSendEachForMulticast', async () => {
            // Arrange
            const users: EligibleUser[] = [
                { uid: 'user1', fcmTokens: ['token1', 'token2'] },
                { uid: 'user2', fcmTokens: ['token3'] },
            ];
            mockSendEachForMulticast.mockResolvedValue({
                responses: [
                    { success: true },
                    { success: true },
                    { success: true },
                ],
            });

            // Act
            await service.sendNotifications(users, summary);

            // Assert
            expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
            expect(mockSendEachForMulticast).toHaveBeenCalledWith(
                expect.objectContaining({
                    tokens: ['token1', 'token2', 'token3'],
                    notification: {
                        title: summary.messageTitle,
                        body: summary.messageShortSummary,
                    },
                    data: expect.objectContaining({ ticker: 'AAPL' }),
                }),
            );
        });

        it('sendNotifications_emptyUsers_doesNotCallMessaging', async () => {
            // Arrange
            const users: EligibleUser[] = [];

            // Act
            await service.sendNotifications(users, summary);

            // Assert
            expect(mockSendEachForMulticast).not.toHaveBeenCalled();
        });

        it('sendNotifications_usersWithNoTokens_doesNotCallMessaging', async () => {
            // Arrange
            const users: EligibleUser[] = [{ uid: 'user1', fcmTokens: [] }];

            // Act
            await service.sendNotifications(users, summary);

            // Assert
            expect(mockSendEachForMulticast).not.toHaveBeenCalled();
        });

        it('sendNotifications_batchSendFails_doesNotThrow', async () => {
            // Arrange
            const users: EligibleUser[] = [{ uid: 'user1', fcmTokens: ['token1'] }];
            mockSendEachForMulticast.mockRejectedValue(new Error('FCM internal error'));

            // Act & Assert
            await expect(service.sendNotifications(users, summary)).resolves.toBeUndefined();
        });

        it('sendNotifications_mixedResults_countsSuccessAndFailure', async () => {
            // Arrange
            const users: EligibleUser[] = [{ uid: 'user1', fcmTokens: ['token1', 'token2'] }];
            mockSendEachForMulticast.mockResolvedValue({
                responses: [
                    { success: true },
                    { success: false, error: { code: 'messaging/registration-token-not-registered' } },
                ],
            });

            // Act
            await service.sendNotifications(users, summary);

            // Assert
            expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
        });

        it('sendNotifications_staleToken_doesNotThrow', async () => {
            // Arrange
            const users: EligibleUser[] = [{ uid: 'user1', fcmTokens: ['stale-token-12345678901234567890'] }];
            mockSendEachForMulticast.mockResolvedValue({
                responses: [
                    {
                        success: false,
                        error: { code: 'messaging/invalid-registration-token' },
                    },
                ],
            });

            // Act
            await service.sendNotifications(users, summary);

            // Assert
            expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
        });
    });
});
