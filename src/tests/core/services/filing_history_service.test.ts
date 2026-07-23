import { FirebaseFilingHistoryService } from '../../../core/services/filing_history_service';
import { SecFiling } from '../../../core/services/sec_service';
import * as firebaseCore from '../../../core/firebase';
import { retry } from '../../../core/retry';
import { emitMetric } from '../../../core/metrics';
import * as crypto from 'crypto';

jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

jest.mock('../../../core/firebase');

jest.mock('../../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));

jest.mock('../../../core/metrics', () => ({
    emitMetric: jest.fn()
}));

describe('FirebaseFilingHistoryService', () => {
    let service: FirebaseFilingHistoryService;
    let mockDocSet: jest.Mock;
    let mockDoc: jest.Mock;
    let mockCollection: jest.Mock;
    let mockTxGet: jest.Mock;
    let mockTxSet: jest.Mock;
    let mockRunTransaction: jest.Mock;

    beforeEach(() => {
        // Arrange
        service = new FirebaseFilingHistoryService();

        mockDocSet = jest.fn().mockResolvedValue(undefined);
        const docRefObj = { set: mockDocSet };
        mockDoc = jest.fn(() => docRefObj);
        mockCollection = jest.fn(() => ({ doc: mockDoc }));

        mockTxGet = jest.fn();
        mockTxSet = jest.fn();
        mockRunTransaction = jest.fn(async (cb) => cb({ get: mockTxGet, set: mockTxSet }));

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: mockCollection,
                runTransaction: mockRunTransaction
            })
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const mockFiling: SecFiling = {
        symbol: 'AAPL',
        filingDate: '2023-01-01',
        acceptedDate: '2023-01-01',
        link: 'http://link',
        finalLink: 'http://final_link',
        formType: '10-Q',
        cik: '123'
    };

    const expectedHash = crypto.createHash('sha256').update('AAPL::http://final_link').digest('hex');

    describe('claimForProcessing', () => {
        it('claimForProcessing_noExistingDoc_claimsAndReturnsTrue', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({ exists: false });

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(true);
            expect(mockDoc).toHaveBeenCalledWith(expectedHash);
            expect(mockTxSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    symbol: 'AAPL',
                    status: 'processing',
                    attempts: 1,
                    leaseExpiresAt: expect.any(Number)
                }),
                { merge: true }
            );
        });

        it('claimForProcessing_alreadySent_returnsFalse', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({ exists: true, data: () => ({ status: 'sent' }) });

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(false);
            expect(mockTxSet).not.toHaveBeenCalled();
        });

        it('claimForProcessing_processingUnexpiredLease_returnsFalse', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({
                exists: true,
                data: () => ({ status: 'processing', leaseExpiresAt: Date.now() + 60_000 })
            });

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(false);
            expect(mockTxSet).not.toHaveBeenCalled();
        });

        it('claimForProcessing_processingExpiredLease_reclaimsAndReturnsTrue', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({
                exists: true,
                data: () => ({ status: 'processing', leaseExpiresAt: Date.now() - 60_000, attempts: 1 })
            });

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(true);
            expect(mockTxSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ status: 'processing', attempts: 2 }),
                { merge: true }
            );
        });

        it('claimForProcessing_attemptsExceedMax_marksFailedAndReturnsFalse', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({
                exists: true,
                data: () => ({ status: 'processing', leaseExpiresAt: Date.now() - 60_000, attempts: 5 })
            });

            // Act
            const result = await service.claimForProcessing(mockFiling, undefined, 5);

            // Assert
            expect(result).toBe(false);
            expect(mockTxSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ status: 'failed', failedAt: expect.any(String) }),
                { merge: true }
            );
        });

        it('claimForProcessing_alreadyFailed_returnsFalse', async () => {
            // Arrange
            mockTxGet.mockResolvedValue({ exists: true, data: () => ({ status: 'failed' }) });

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(false);
            expect(mockTxSet).not.toHaveBeenCalled();
        });

        it('claimForProcessing_noFinalLink_returnsFalse', async () => {
            // Arrange
            const badFiling = { ...mockFiling, finalLink: '' };

            // Act
            const result = await service.claimForProcessing(badFiling);

            // Assert
            expect(result).toBe(false);
            expect(mockRunTransaction).not.toHaveBeenCalled();
        });

        it('claimForProcessing_transactionThrows_returnsFalse', async () => {
            // Arrange
            mockRunTransaction.mockRejectedValue(new Error('firestore down'));

            // Act
            const result = await service.claimForProcessing(mockFiling);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('markSent', () => {
        it('markSent_validFiling_setsStatusSent', async () => {
            // Arrange
            mockDocSet.mockResolvedValue(undefined);

            // Act
            await service.markSent(mockFiling);

            // Assert
            expect(mockDoc).toHaveBeenCalledWith(expectedHash);
            expect(mockDocSet).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'sent', sentAt: expect.any(String) }),
                { merge: true }
            );
        });

        it('markSent_noFinalLink_doesNothing', async () => {
            // Arrange
            const badFiling = { ...mockFiling, finalLink: '' };

            // Act
            await service.markSent(badFiling);

            // Assert
            expect(mockDocSet).not.toHaveBeenCalled();
        });

        it('markSent_success_invokesRetryWithConfiguredAttempts', async () => {
            // Arrange
            mockDocSet.mockResolvedValue(undefined);

            // Act
            await service.markSent(mockFiling);

            // Assert
            expect(retry).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 3 });
        });

        it('markSent_writeFailsAllAttempts_emitsMetricAndSwallows', async () => {
            // Arrange
            mockDocSet.mockRejectedValue(new Error('firestore down'));

            // Act
            const result = await service.markSent(mockFiling);

            // Assert
            expect(result).toBeUndefined();
            expect(emitMetric).toHaveBeenCalledWith(
                'filing_mark_sent_failed',
                { symbol: 'AAPL', formType: '10-Q' }
            );
        });
    });

    describe('releaseClaim', () => {
        it('releaseClaim_validFiling_expiresLease', async () => {
            // Arrange
            mockDocSet.mockResolvedValue(undefined);

            // Act
            await service.releaseClaim(mockFiling);

            // Assert
            expect(mockDoc).toHaveBeenCalledWith(expectedHash);
            expect(mockDocSet).toHaveBeenCalledWith({ leaseExpiresAt: null }, { merge: true });
        });

        it('releaseClaim_noFinalLink_doesNothing', async () => {
            // Arrange
            const badFiling = { ...mockFiling, finalLink: '' };

            // Act
            await service.releaseClaim(badFiling);

            // Assert
            expect(mockDocSet).not.toHaveBeenCalled();
        });
    });
});
