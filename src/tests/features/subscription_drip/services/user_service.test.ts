
import { FirebaseUserService } from '../../../../features/subscription_drip/services/user_service';

const mockGet = jest.fn();
const mockLimit = jest.fn(() => ({ get: mockGet }));
const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
const mockWhere2 = jest.fn(() => ({ orderBy: mockOrderBy }));
const mockWhere1 = jest.fn(() => ({ where: mockWhere2 }));
const mockCollection = jest.fn(() => ({ where: mockWhere1 }));
const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

jest.mock('../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn(() => ({
        firestore: mockFirestore
    }))
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn()
    }))
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));

describe('FirebaseUserService', () => {
    let service: FirebaseUserService;

    beforeEach(() => {
        service = new FirebaseUserService();
        jest.clearAllMocks();

        mockGet.mockResolvedValue({ empty: true, docs: [], size: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLimit.mockReturnValue({ get: mockGet, startAfter: jest.fn(() => ({ get: mockGet })) } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockOrderBy.mockReturnValue({ limit: mockLimit } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockWhere2.mockReturnValue({ orderBy: mockOrderBy } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockWhere1.mockReturnValue({ where: mockWhere2 } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockCollection.mockReturnValue({ where: mockWhere1 } as any);
    });

    it('streamRecentFreeUsers_success_returnsUsers', async () => {
        // Arrange
        const mockDocs = [
            { id: 'u1', data: () => ({ fcmToken: 't1', isSubscribed: false, createdAt: '2023-01-01' }) }
        ];

        mockGet.mockResolvedValueOnce({
            empty: false,
            docs: mockDocs,
            size: 1
        });

        // Act
        const generator = service.streamRecentFreeUsers(7, 100);
        let batches = 0;
        let userCount = 0;

        for await (const batch of generator) {
            batches++;
            userCount += batch.length;
            if (batch.length > 0) {
                expect(batch[0]!.id).toBe('u1');
                expect(batch[0]!.fcmToken).toBe('t1');
            }
        }

        // Assert
        expect(batches).toBe(1);
        expect(userCount).toBe(1);
        expect(mockCollection).toHaveBeenCalledWith('users');
    });

    it('streamRecentFreeUsers_noToken_skipsUser', async () => {
        // Arrange
        const mockDocs = [
            { id: 'u1', data: () => ({ isSubscribed: false }) }
        ];

        mockGet.mockResolvedValueOnce({
            empty: false,
            docs: mockDocs,
            size: 1
        });

        // Act
        const generator = service.streamRecentFreeUsers(7);
        for await (const batch of generator) {
            expect(batch.length).toBe(0);
        }

        // Assert (Implied by loop finishing without errors and batch length check)
    });
});
