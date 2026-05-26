import { FirestoreService } from '../../../../../features/weekly_recap/retrieval_and_messaging/services/firestore_service';
import { getFirebaseAdmin } from '../../../../../core/firebase';

let mockUsersGet: jest.Mock;
let mockWatchlistGet: jest.Mock;
let mockWeeksGet: jest.Mock;

jest.mock('../../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn().mockReturnValue({
        firestore: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnThis(),
                get: (...args: unknown[]) => mockUsersGet?.(...args),
                doc: jest.fn().mockReturnValue({
                    collection: jest.fn().mockReturnValue({
                        get: (...args: unknown[]) => mockWatchlistGet?.(...args),
                    }),
                }),
            }),
            collectionGroup: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnThis(),
                get: (...args: unknown[]) => mockWeeksGet?.(...args),
            }),
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

describe('FirestoreService', () => {
    let service: FirestoreService;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockUsersGet = jest.fn();
        mockWatchlistGet = jest.fn();
        mockWeeksGet = jest.fn();

        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: jest.fn().mockReturnValue({
                collection: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnThis(),
                    get: (...args: unknown[]) => mockUsersGet?.(...args),
                    doc: jest.fn().mockReturnValue({
                        collection: jest.fn().mockReturnValue({
                            get: (...args: unknown[]) => mockWatchlistGet?.(...args),
                        }),
                    }),
                }),
                collectionGroup: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnThis(),
                    get: (...args: unknown[]) => mockWeeksGet?.(...args),
                }),
            }),
        });

        service = new FirestoreService();
    });

    describe('retrieveEligibleUsers', () => {
        it('retrieveEligibleUsers_withValidUsers_returnsUserRecords', async () => {
            // Arrange
            const mockUserDoc = {
                id: 'user1',
                data: () => ({ fcmTokens: { device1: 'token-abc', device2: 'token-xyz' }, notificationsEnabled: true }),
            };
            const mockWatchlistDocs = [{ id: 'AAPL' }, { id: 'MSFT' }];
            mockUsersGet.mockResolvedValue({ size: 1, docs: [mockUserDoc] });
            mockWatchlistGet.mockResolvedValue({ docs: mockWatchlistDocs });

            // Act
            const result = await service.retrieveEligibleUsers();

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                uid: 'user1',
                fcmTokens: expect.arrayContaining(['token-abc', 'token-xyz']),
                tickers: ['AAPL', 'MSFT'],
            });
        });

        it('retrieveEligibleUsers_emptySnapshot_returnsEmptyArray', async () => {
            // Arrange
            mockUsersGet.mockResolvedValue({ size: 0, docs: [] });

            // Act
            const result = await service.retrieveEligibleUsers();

            // Assert
            expect(result).toEqual([]);
        });

        it('retrieveEligibleUsers_firestoreQueryFails_throws', async () => {
            // Arrange
            mockUsersGet.mockRejectedValue(new Error('Firestore unavailable'));

            // Act & Assert
            await expect(service.retrieveEligibleUsers()).rejects.toThrow('Firestore unavailable');
        });

        it('retrieveEligibleUsers_watchlistQueryFails_skipsUser', async () => {
            // Arrange
            const mockUserDoc = {
                id: 'user1',
                data: () => ({ fcmTokens: { device1: 'token-abc' }, notificationsEnabled: true }),
            };
            mockUsersGet.mockResolvedValue({ size: 1, docs: [mockUserDoc] });
            mockWatchlistGet.mockRejectedValue(new Error('Subcollection read failed'));

            // Act
            const result = await service.retrieveEligibleUsers();

            // Assert
            expect(result).toHaveLength(0);
        });

        it('retrieveEligibleUsers_fcmTokensNotObject_returnsEmptyTokens', async () => {
            // Arrange
            const mockUserDoc = {
                id: 'user1',
                data: () => ({ fcmTokens: ['token1', 'token2'], notificationsEnabled: true }),
            };
            const mockWatchlistDocs = [{ id: 'AAPL' }];
            mockUsersGet.mockResolvedValue({ size: 1, docs: [mockUserDoc] });
            mockWatchlistGet.mockResolvedValue({ docs: mockWatchlistDocs });

            // Act
            const result = await service.retrieveEligibleUsers();

            // Assert
            expect(result[0]?.fcmTokens).toEqual([]);
        });

        it('retrieveEligibleUsers_duplicateFcmTokenValues_deduplicatesTokens', async () => {
            // Arrange
            const mockUserDoc = {
                id: 'user1',
                data: () => ({ fcmTokens: { device1: 'same-token', device2: 'same-token' }, notificationsEnabled: true }),
            };
            mockUsersGet.mockResolvedValue({ size: 1, docs: [mockUserDoc] });
            mockWatchlistGet.mockResolvedValue({ docs: [] });

            // Act
            const result = await service.retrieveEligibleUsers();

            // Assert
            expect(result[0]?.fcmTokens).toEqual(['same-token']);
        });
    });

    describe('retrieveSummariesForWeek', () => {
        it('retrieveSummariesForWeek_withValidDocs_returnsSummaries', async () => {
            // Arrange
            const mockDoc = {
                ref: { path: 'users/u1/watchlist/AAPL/weeks/2026-05-25' },
                data: () => ({
                    ticker: 'AAPL',
                    companyName: 'Apple Inc.',
                    messageTitle: 'AAPL Weekly Recap',
                    messageShortSummary: 'Strong performance this week.',
                }),
            };
            mockWeeksGet.mockResolvedValue({ docs: [mockDoc] });

            // Act
            const result = await service.retrieveSummariesForWeek('2026-05-25');

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                ticker: 'AAPL',
                companyName: 'Apple Inc.',
                weekEndDate: '2026-05-25',
                messageTitle: 'AAPL Weekly Recap',
                messageShortSummary: 'Strong performance this week.',
            });
        });

        it('retrieveSummariesForWeek_emptySnapshot_returnsEmptyArray', async () => {
            // Arrange
            mockWeeksGet.mockResolvedValue({ docs: [] });

            // Act
            const result = await service.retrieveSummariesForWeek('2026-05-25');

            // Assert
            expect(result).toEqual([]);
        });

        it('retrieveSummariesForWeek_firestoreQueryFails_throws', async () => {
            // Arrange
            mockWeeksGet.mockRejectedValue(new Error('Collection group query failed'));

            // Act & Assert
            await expect(service.retrieveSummariesForWeek('2026-05-25')).rejects.toThrow('Collection group query failed');
        });

        it('retrieveSummariesForWeek_missingTicker_skipsDoc', async () => {
            // Arrange
            const mockDoc = {
                ref: { path: 'users/u1/watchlist/AAPL/weeks/2026-05-25' },
                data: () => ({
                    companyName: 'Apple Inc.',
                    messageTitle: 'AAPL Weekly',
                    messageShortSummary: 'Strong week',
                }),
            };
            mockWeeksGet.mockResolvedValue({ docs: [mockDoc] });

            // Act
            const result = await service.retrieveSummariesForWeek('2026-05-25');

            // Assert
            expect(result).toHaveLength(0);
        });

        it('retrieveSummariesForWeek_missingCompanyName_skipsDoc', async () => {
            // Arrange
            const mockDoc = {
                ref: { path: 'users/u1/watchlist/AAPL/weeks/2026-05-25' },
                data: () => ({
                    ticker: 'AAPL',
                    messageTitle: 'AAPL Weekly',
                    messageShortSummary: 'Strong week',
                }),
            };
            mockWeeksGet.mockResolvedValue({ docs: [mockDoc] });

            // Act
            const result = await service.retrieveSummariesForWeek('2026-05-25');

            // Assert
            expect(result).toHaveLength(0);
        });

        it('retrieveSummariesForWeek_multipleDocs_returnsOnlyValidSummaries', async () => {
            // Arrange
            const validDoc = {
                ref: { path: 'users/u1/watchlist/AAPL/weeks/2026-05-25' },
                data: () => ({
                    ticker: 'AAPL',
                    companyName: 'Apple Inc.',
                    messageTitle: 'AAPL Weekly',
                    messageShortSummary: 'Strong week',
                }),
            };
            const invalidDoc = {
                ref: { path: 'users/u2/watchlist/MSFT/weeks/2026-05-25' },
                data: () => ({ companyName: 'Microsoft' }),
            };
            mockWeeksGet.mockResolvedValue({ docs: [validDoc, invalidDoc] });

            // Act
            const result = await service.retrieveSummariesForWeek('2026-05-25');

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]?.ticker).toBe('AAPL');
        });
    });
});
