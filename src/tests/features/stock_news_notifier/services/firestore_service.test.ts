import { Timestamp } from 'firebase-admin/firestore';
import {
    computeNewsId,
    FirestoreService
} from '../../../../features/stock_news_notifier/services/firestore_service';
import { getFirebaseAdmin } from '../../../../core/firebase';
import { StockNewsArticle } from '../../../../features/stock_news_notifier/models';

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

const article: StockNewsArticle = {
    symbol: 'AAPL',
    publishedDate: '2026-01-05 06:30:00',
    publisher: 'Reuters',
    title: 'A headline',
    image: null,
    site: 'reuters.com',
    text: 'Some text',
    url: 'https://news.example.com/1'
};

describe('computeNewsId', () => {
    it('computeNewsId_sameInputs_returnsStableSha256', () => {
        // Arrange
        const symbol = 'AAPL';
        const url = 'https://news.example.com/1';

        // Act
        const first = computeNewsId(symbol, url);
        const second = computeNewsId(symbol, url);

        // Assert
        expect(first).toBe(second);
        expect(first).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computeNewsId_differentSymbolsSameUrl_returnsDifferentIds', () => {
        // Arrange
        const url = 'https://news.example.com/1';

        // Act
        const first = computeNewsId('AAPL', url);
        const second = computeNewsId('MSFT', url);

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

    it('acquireLease_noExistingLease_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({ exists: false, data: () => undefined });

        // Act
        const result = await service.acquireLease();

        // Assert
        expect(result).toBe(true);
        expect(Timestamp.fromMillis).toHaveBeenCalledWith(NOW_MS + 90 * 1000);
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { leaseExpiresAt: expect.anything() },
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
        const result = await service.acquireLease();

        // Assert
        expect(result).toBe(false);
        expect(mockTxn.set).not.toHaveBeenCalled();
    });

    it('acquireLease_expiredLease_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ leaseExpiresAt: { toMillis: () => NOW_MS - 1000 } })
        });

        // Act
        const result = await service.acquireLease();

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('acquireLease_malformedLeaseField_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ leaseExpiresAt: 'not-a-timestamp' })
        });

        // Act
        const result = await service.acquireLease();

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('acquireLease_transactionFails_propagatesError', async () => {
        // Arrange
        mockDb.runTransaction.mockRejectedValue(new Error('txn aborted'));

        // Act & Assert
        await expect(service.acquireLease()).rejects.toThrow('txn aborted');
    });

    it('releaseLease_success_writesCurrentTimestamp', async () => {
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

    it('getCursor_docWithoutWatermarkField_returnsNull', async () => {
        // Arrange
        mockDocRef.get.mockResolvedValue({
            exists: true,
            data: () => ({ leaseExpiresAt: { toMillis: () => NOW_MS } })
        });

        // Act
        const result = await service.getCursor();

        // Assert
        expect(result).toBeNull();
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
            { lastPublishedDate: '2026-01-05 12:00:00', updatedAt: 'SERVER_TIMESTAMP' },
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
            { lastPublishedDate: '2026-01-05 12:00:00', updatedAt: 'SERVER_TIMESTAMP' },
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
            { lastPublishedDate: '2026-01-05 12:00:00', updatedAt: 'SERVER_TIMESTAMP' },
            { merge: true }
        );
    });

    it('createNewsIfAbsent_newArticle_createsDocAndReturnsTrue', async () => {
        // Arrange
        mockDocRef.create.mockResolvedValue(undefined);

        // Act
        const result = await service.createNewsIfAbsent(article);

        // Assert
        expect(result).toBe(true);
        expect(mockDb.collection).toHaveBeenCalledWith('stock_news');
        expect(mockDocRef.create).toHaveBeenCalledWith(
            expect.objectContaining({
                symbol: 'AAPL',
                url: article.url,
                newsId: computeNewsId('AAPL', article.url),
                createdAt: 'SERVER_TIMESTAMP',
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

    it('claimNotificationSlot_noPriorNotification_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({ exists: false, data: () => undefined });

        // Act
        const result = await service.claimNotificationSlot('AAPL', 600);

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledWith(
            mockDocRef,
            { ticker: 'AAPL', lastNotifiedAt: expect.anything() },
            { merge: true }
        );
    });

    it('claimNotificationSlot_withinCooldown_returnsFalse', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastNotifiedAt: { toMillis: () => NOW_MS - 100_000 } })
        });

        // Act
        const result = await service.claimNotificationSlot('AAPL', 600);

        // Assert
        expect(result).toBe(false);
        expect(mockTxn.set).not.toHaveBeenCalled();
    });

    it('claimNotificationSlot_cooldownElapsed_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastNotifiedAt: { toMillis: () => NOW_MS - 700_000 } })
        });

        // Act
        const result = await service.claimNotificationSlot('AAPL', 600);

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('claimNotificationSlot_malformedLastNotifiedAt_claimsAndReturnsTrue', async () => {
        // Arrange
        mockTxn.get.mockResolvedValue({
            exists: true,
            data: () => ({ lastNotifiedAt: 'not-a-timestamp' })
        });

        // Act
        const result = await service.claimNotificationSlot('AAPL', 600);

        // Assert
        expect(result).toBe(true);
        expect(mockTxn.set).toHaveBeenCalledTimes(1);
    });

    it('claimNotificationSlot_transactionFails_failsClosedWithFalse', async () => {
        // Arrange
        mockDb.runTransaction.mockRejectedValue(new Error('txn aborted'));

        // Act
        const result = await service.claimNotificationSlot('AAPL', 600);

        // Assert
        expect(result).toBe(false);
    });
});
