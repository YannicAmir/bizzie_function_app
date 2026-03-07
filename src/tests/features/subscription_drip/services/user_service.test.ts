
import { FirebaseUserService } from '../../../../features/subscription_drip/services/user_service';

jest.mock('../../../../core/logger');
jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));


describe('FirebaseUserService', () => {
    let userService: FirebaseUserService;
    let mockDb: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockCollection: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockQuery: any; // eslint-disable-line @typescript-eslint/no-explicit-any


    beforeEach(() => {
        // Arrange
        mockQuery = {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            startAfter: jest.fn().mockReturnThis(),
            get: jest.fn()
        };

        mockCollection = {
            where: jest.fn().mockReturnValue(mockQuery),
            orderBy: jest.fn().mockReturnValue(mockQuery),
            limit: jest.fn().mockReturnValue(mockQuery)
        };

        mockDb = {
            collection: jest.fn().mockReturnValue(mockCollection)
        };
        mockCollection.where.mockReturnValue(mockQuery);

        userService = new FirebaseUserService(mockDb);
    });

    it('streamRecentFreeUsers_success_yieldsCorrectUsers', async () => {
        // Arrange
        const mockDate = new Date();
        const mockDocs = [
            {
                id: 'user1',
                data: () => ({
                    fcmTokens: { 'ios': 'token1' },
                    createdAt: { toDate: () => mockDate },
                    isSubscribed: false,
                    notificationsEnabled: true
                })
            },
            {
                id: 'user2',
                data: () => ({
                    fcmTokens: { 'android': 'token2' },
                    createdAt: { toDate: () => mockDate },
                    isSubscribed: false,
                    notificationsEnabled: false
                })
            },
            {
                id: 'user3',
                data: () => ({
                    fcmTokens: null,
                    createdAt: { toDate: () => mockDate },
                    isSubscribed: false,
                    notificationsEnabled: true
                })
            }
        ];

        const mockSnapshot = {
            empty: false,
            docs: mockDocs,
            size: 3
        };

        mockQuery.get.mockResolvedValueOnce(mockSnapshot)
            .mockResolvedValueOnce({ empty: true, docs: [], size: 0 });

        // Act
        const generator = userService.streamRecentFreeUsers(7);
        const result = await generator.next();

        // Assert
        expect(result.done).toBe(false);

        const users = result.value;
        expect(users).toHaveLength(3);

        expect(users[0].id).toBe('user1');
        expect(users[0].fcmTokens).toEqual({ 'ios': 'token1' });
        expect(users[0].notificationsEnabled).toBe(true);

        expect(users[1].id).toBe('user2');
        expect(users[1].notificationsEnabled).toBe(false);

        expect(users[2].id).toBe('user3');
        expect(users[2].fcmTokens).toEqual({});
    });

    it('streamRecentFreeUsers_emptyResult_yieldsNothing', async () => {
        // Arrange
        mockQuery.get.mockResolvedValueOnce({ empty: true, docs: [], size: 0 });

        // Act
        const generator = userService.streamRecentFreeUsers(7);
        const result = await generator.next();

        // Assert
        expect(result.done).toBe(true);
        expect(result.value).toBeUndefined();
    });
});
