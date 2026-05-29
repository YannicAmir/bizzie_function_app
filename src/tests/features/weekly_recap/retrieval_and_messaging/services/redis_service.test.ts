import { RedisService } from '../../../../../features/weekly_recap/retrieval_and_messaging/services/redis_service';
import type { UserRecord } from '../../../../../features/weekly_recap/retrieval_and_messaging/models';

const mockPipeline = {
    set: jest.fn().mockReturnThis(),
    sadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn(),
};

const mockRedisClient = {
    pipeline: jest.fn().mockReturnValue(mockPipeline),
    smembers: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
};

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedisClient),
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

describe('RedisService', () => {
    let service: RedisService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockRedisClient.pipeline.mockReturnValue(mockPipeline);
        service = new RedisService();
        service.init('redis://localhost:6379');
    });

    describe('storeUsers', () => {
        it('storeUsers_withUsers_executesPipelineWithUserAndTickerKeys', async () => {
            // Arrange
            const users: UserRecord[] = [
                { uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL', 'MSFT'] },
            ];
            mockPipeline.exec.mockResolvedValue([[null, 'OK'], [null, 1], [null, 1], [null, 1]]);

            // Act
            await service.storeUsers(users);

            // Assert
            expect(mockPipeline.set).toHaveBeenCalledWith(
                'user:user1',
                JSON.stringify({ fcmTokens: ['token1'] }),
                'EX',
                86400,
            );
            expect(mockPipeline.sadd).toHaveBeenCalledWith('ticker:AAPL', 'user1');
            expect(mockPipeline.sadd).toHaveBeenCalledWith('ticker:MSFT', 'user1');
        });

        it('storeUsers_withMultipleUsers_setsAllTickerSets', async () => {
            // Arrange
            const users: UserRecord[] = [
                { uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL'] },
                { uid: 'user2', fcmTokens: ['token2'], tickers: ['AAPL', 'GOOG'] },
            ];
            mockPipeline.exec.mockResolvedValue([
                [null, 'OK'], [null, 'OK'],
                [null, 1], [null, 1], [null, 1],
                [null, 1], [null, 1],
            ]);

            // Act
            await service.storeUsers(users);

            // Assert
            expect(mockPipeline.expire).toHaveBeenCalledWith('ticker:AAPL', 86400);
            expect(mockPipeline.expire).toHaveBeenCalledWith('ticker:GOOG', 86400);
        });

        it('storeUsers_pipelineAborted_throws', async () => {
            // Arrange
            const users: UserRecord[] = [{ uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL'] }];
            mockPipeline.exec.mockResolvedValue(null);

            // Act & Assert
            await expect(service.storeUsers(users)).rejects.toThrow('Redis pipeline aborted');
        });

        it('storeUsers_pipelineCommandError_throws', async () => {
            // Arrange
            const users: UserRecord[] = [{ uid: 'user1', fcmTokens: ['token1'], tickers: ['AAPL'] }];
            mockPipeline.exec.mockResolvedValue([[new Error('WRONGTYPE error')], [null, 1]]);

            // Act & Assert
            await expect(service.storeUsers(users)).rejects.toThrow('WRONGTYPE error');
        });
    });

    describe('claimUsersForTicker', () => {
        it('claimUsersForTicker_withUsers_returnsEligibleUsers', async () => {
            // Arrange
            mockRedisClient.smembers.mockResolvedValue(['user1', 'user2']);
            mockRedisClient.del.mockResolvedValue(1);
            mockRedisClient.getdel
                .mockResolvedValueOnce(JSON.stringify({ fcmTokens: ['token1'] }))
                .mockResolvedValueOnce(JSON.stringify({ fcmTokens: ['token2'] }));

            // Act
            const result = await service.claimUsersForTicker('AAPL');

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ uid: 'user1', fcmTokens: ['token1'] });
            expect(result[1]).toEqual({ uid: 'user2', fcmTokens: ['token2'] });
        });

        it('claimUsersForTicker_noUids_returnsEmptyArray', async () => {
            // Arrange
            mockRedisClient.smembers.mockResolvedValue([]);
            mockRedisClient.del.mockResolvedValue(0);

            // Act
            const result = await service.claimUsersForTicker('AAPL');

            // Assert
            expect(result).toEqual([]);
        });

        it('claimUsersForTicker_smembersFails_throws', async () => {
            // Arrange
            mockRedisClient.smembers.mockRejectedValue(new Error('ECONNRESET'));

            // Act & Assert
            await expect(service.claimUsersForTicker('AAPL')).rejects.toThrow('ECONNRESET');
        });

        it('claimUsersForTicker_userKeyMissing_skipsUser', async () => {
            // Arrange
            mockRedisClient.smembers.mockResolvedValue(['user1']);
            mockRedisClient.del.mockResolvedValue(1);
            mockRedisClient.getdel.mockResolvedValue(null);

            // Act
            const result = await service.claimUsersForTicker('AAPL');

            // Assert
            expect(result).toHaveLength(0);
        });

        it('claimUsersForTicker_invalidUserJson_skipsUser', async () => {
            // Arrange
            mockRedisClient.smembers.mockResolvedValue(['user1']);
            mockRedisClient.del.mockResolvedValue(1);
            mockRedisClient.getdel.mockResolvedValue('not-valid-json{{{');

            // Act
            const result = await service.claimUsersForTicker('AAPL');

            // Assert
            expect(result).toHaveLength(0);
        });

        it('claimUsersForTicker_getdelFails_skipsUser', async () => {
            // Arrange
            mockRedisClient.smembers.mockResolvedValue(['user1', 'user2']);
            mockRedisClient.del.mockResolvedValue(1);
            mockRedisClient.getdel
                .mockRejectedValueOnce(new Error('GETDEL error'))
                .mockResolvedValueOnce(JSON.stringify({ fcmTokens: ['token2'] }));

            // Act
            const result = await service.claimUsersForTicker('AAPL');

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]?.uid).toBe('user2');
        });
    });
});
