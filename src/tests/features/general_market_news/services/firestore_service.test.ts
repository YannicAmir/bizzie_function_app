import { Timestamp } from 'firebase-admin/firestore';
import {
    computeNewsId,
    FirestoreService
} from '../../../../features/general_market_news/services/firestore_service';
import { getFirebaseAdmin } from '../../../../core/firebase';
import { GeneralNewsArticle } from '../../../../features/general_market_news/models/GeneralNewsArticle';

jest.mock('../../../../core/firebase', () => ({
    getFirebaseAdmin: jest.fn()
}));
jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));
jest.mock('firebase-admin/firestore', () => ({
    Timestamp: {
        now: jest.fn(),
        fromMillis: jest.fn((ms: number) => ({ toMillis: () => ms }))
    },
    FieldValue: {
        serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP')
    }
}));

const NOW_MS = 1_767_614_400_000;
const RUN_INTERVAL_SECONDS = 60;
const LEASE_DURATION_MS = 90 * 1000;

const article: GeneralNewsArticle = {
    publishedDate: '2026-01-05 06:30:00',
    publisher: 'Reuters',
    title: 'A headline',
    image: null,
    site: 'reuters.com',
    text: 'Some text',
    url: 'https://news.example.com/1'
};

describe('computeNewsId', () => {
    it('computeNewsId_sameUrl_returnsStableSha256', () => {
        // Arrange
        const url = 'https://news.example.com/1';

        // Act
        const first = computeNewsId(url);
        const second = computeNewsId(url);

        // Assert
        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computeNewsId_differentUrls_returnsDifferentIds', () => {
        // Arrange
        const first = computeNewsId('https://news.example.com/1');

        // Act
        const second = computeNewsId('https://news.example.com/2');

        // Assert
        expect(first).not.toBe(second);
    });
});

describe('FirestoreService', () => {
    let service: FirestoreService;
    let mockTxn: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockDocRef: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockDb: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        (Timestamp.now as jest.Mock).mockReturnValue({ toMillis: () => NOW_MS });

        mockTxn = {
            get: jest.fn(),
            set: jest.fn()
        };
        mockDocRef = {
            get: jest.fn(),
            set: jest.fn(),
            create: jest.fn()
        };
        mockDb = {
            collection: jest.fn().mockReturnValue({
                doc: jest.fn().mockReturnValue(mockDocRef)
            }),
            runTransaction: jest.fn(async (fn: (txn: unknown) => Promise<unknown>) => fn(mockTxn))
        };
        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => mockDb
        });

        service = new FirestoreService();
    });

    it('acquireLease_noExistingState_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({ exists: false, data: () => undefined });

        // Act
        const result = await service.acquireLease(RUN_INTERVAL_SECONDS);

        // Assert
        expect(result).toBe(true);
        expect(Timestamp.fromMillis).toHaveBeenCalledWith(NOW_MS + LEASE_DURATION_MS);
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { leaseExpiresAt: expect.anything(), lastRunAt: expect.anything() },
            { merge: true }
        );
    });

    it('acquireLease_activeLease_returnsFalse', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ leaseExpiresAt: { toMillis: () => NOW_MS + 30_000 } })
        });

        // Act
        const result = await service.acquireLease(RUN_INTERVAL_SECONDS);

        // Assert
        expect(result).toBe(false);
        expect(mockTxn.set).not.toHaveBeenCalled();
    });

    it('acquireLease_withinRunInterval_returnsFalse', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastRunAt: { toMillis: () => NOW_MS - 10_000 } })
        });

        // Act
        const result = await service.acquireLease(RUN_INTERVAL_SECONDS);

        // Assert
        expect(result).toBe(false);
        expect(mockTxn.set).not.toHaveBeenCalled();
    });

    it('acquireLease_intervalElapsed_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastRunAt: { toMillis: () => NOW_MS - 120_000 } })
        });

        // Act
        const result = await service.acquireLease(RUN_INTERVAL_SECONDS);

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('acquireLease_malformedTimestampFields_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ leaseExpiresAt: 'not-a-timestamp', lastRunAt: 'not-a-timestamp' })
        });

        // Act
        const result = await service.acquireLease(RUN_INTERVAL_SECONDS);

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('acquireLease_transactionFails_propagatesError', async () => {
        // Arrange
        mockDb.runTransaction.mockRejectedValue(new Error('txn aborted'));

        // Act & Assert
        await expect(service.acquireLease(RUN_INTERVAL_SECONDS)).rejects.toThrow('txn aborted');
    });

    it('releaseLease_success_writesExpiringTimestamp', async () => {
        // Arrange
        mockDocRef.set.mockResolvedValue(undefined);

        // Act
        await service.releaseLease();

        // Assert
        expect(mockDocRef.set).toHaveBeenCalledWith(
            { leaseExpiresAt: expect.anything() },
            { merge: true }
        );
    });

    it('releaseLease_writeFails_swallowsError', async () => {
        // Arrange
        mockDocRef.set.mockRejectedValue(new Error('unavailable'));

        // Act & Assert
        await expect(service.releaseLease()).resolves.toBeUndefined();
    });

    it('getCursor_missingDoc_returnsNull', async () => {
        // Arrange
        mockDocRef.get.mockResolvedValue({ exists: false, data: () => undefined });

        // Act
        const result = await service.getCursor();

        // Assert
        expect(result).toBeNull();
    });

    it('getCursor_existingWatermark_returnsValue', async () => {
        // Arrange
        mockDocRef.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastPublishedDate: '2026-01-05 12:00:00' })
        });

        // Act
        const result = await service.getCursor();

        // Assert
        expect(result).toBe('2026-01-05 12:00:00');
    });

    it('getCursor_malformedWatermarkField_returnsNull', async () => {
        // Arrange
        mockDocRef.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastPublishedDate: 12345 })
        });

        // Act
        const result = await service.getCursor();

        // Assert
        expect(result).toBeNull();
    });

    it('advanceCursor_newerCandidate_writesCandidate', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastPublishedDate: '2026-01-05 11:00:00' })
        });

        // Act
        await service.advanceCursor('2026-01-05 12:00:00');

        // Assert
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { lastPublishedDate: '2026-01-05 12:00:00' },
            { merge: true }
        );
    });

    it('advanceCursor_olderCandidate_keepsCurrentWatermark', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastPublishedDate: '2026-01-05 12:00:00' })
        });

        // Act
        await service.advanceCursor('2026-01-04 09:00:00');

        // Assert
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { lastPublishedDate: '2026-01-05 12:00:00' },
            { merge: true }
        );
    });

    it('advanceCursor_missingDoc_writesCandidate', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({ exists: false, data: () => undefined });

        // Act
        await service.advanceCursor('2026-01-05 12:00:00');

        // Assert
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { lastPublishedDate: '2026-01-05 12:00:00' },
            { merge: true }
        );
    });

    it('advanceCursor_transactionFails_propagatesError', async () => {
        // Arrange
        mockDb.runTransaction.mockRejectedValue(new Error('txn aborted'));

        // Act & Assert
        await expect(service.advanceCursor('2026-01-05 12:00:00')).rejects.toThrow('txn aborted');
    });

    it('createNewsIfAbsent_newArticle_createsDocAndReturnsTrue', async () => {
        // Arrange
        mockDocRef.create.mockResolvedValue(undefined);

        // Act
        const result = await service.createNewsIfAbsent(article);

        // Assert
        expect(result).toBe(true);
        expect(mockDb.collection).toHaveBeenCalledWith('general_market_news');
        expect(mockDocRef.create).toHaveBeenCalledWith(
            expect.objectContaining({
                url: article.url,
                newsId: computeNewsId(article.url),
                createdAt: 'SERVER_TIMESTAMP',
                publishedAt: expect.anything(),
                expireAt: expect.anything()
            })
        );
    });

    it('createNewsIfAbsent_grpcAlreadyExists_returnsFalse', async () => {
        // Arrange
        mockDocRef.create.mockRejectedValue({ code: 6 });

        // Act
        const result = await service.createNewsIfAbsent(article);

        // Assert
        expect(result).toBe(false);
    });

    it('createNewsIfAbsent_stringAlreadyExistsCode_returnsFalse', async () => {
        // Arrange
        mockDocRef.create.mockRejectedValue({ code: 'already-exists' });

        // Act
        const result = await service.createNewsIfAbsent(article);

        // Assert
        expect(result).toBe(false);
    });

    it('createNewsIfAbsent_otherError_rethrows', async () => {
        // Arrange
        mockDocRef.create.mockRejectedValue(new Error('permission denied'));

        // Act & Assert
        await expect(service.createNewsIfAbsent(article)).rejects.toThrow('permission denied');
    });
});
