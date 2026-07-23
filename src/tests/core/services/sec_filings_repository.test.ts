import { FirebaseSecFilingsRepository } from '../../../core/services/sec_filings_repository';
import { SecFiling } from '../../../core/services/sec_service';
import { Enriched8kData, EnrichedFinancialData } from '../../../core/services/ai_service';
import * as firebaseCore from '../../../core/firebase';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

jest.mock('../../../core/firebase');

jest.mock('../../../core/retry', () => ({
    retry: jest.fn((fn) => fn())
}));

describe('FirebaseSecFilingsRepository', () => {
    let repository: FirebaseSecFilingsRepository;
    let mockAdd: jest.Mock;
    let mockDocSet: jest.Mock;
    let mockDoc: jest.Mock;
    let mockCollection: jest.Mock;

    beforeEach(() => {
        repository = new FirebaseSecFilingsRepository();

        mockAdd = jest.fn().mockResolvedValue(undefined);
        mockDocSet = jest.fn().mockResolvedValue(undefined);
        mockDoc = jest.fn(() => ({ set: mockDocSet }));
        mockCollection = jest.fn(() => ({ add: mockAdd, doc: mockDoc }));

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({ collection: mockCollection })
        });

        Object.defineProperty(admin.firestore, 'FieldValue', {
            value: { serverTimestamp: jest.fn().mockReturnValue('SERVER_TIMESTAMP') },
            writable: true
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const filing: SecFiling = {
        symbol: 'AAPL',
        filingDate: '2023-10-01',
        acceptedDate: '2023-10-01',
        link: 'http://link',
        finalLink: 'http://final_link',
        formType: '8-K',
        cik: '123'
    };

    const enriched: Enriched8kData = {
        topic: 'M&A',
        summary: 'Apple buys startup.',
        sentiment: 'Positive',
        isEarnings: false,
        revenue: null,
        eps: null
    };

    const expectedDocId = crypto.createHash('sha256').update('AAPL::http://final_link').digest('hex');

    describe('saveEnriched8k', () => {
        it('saveEnriched8k_writesToSecFilingsCollection', async () => {
            await repository.saveEnriched8k({ filing, enriched, companyName: 'Apple', link: filing.finalLink });

            expect(mockCollection).toHaveBeenCalledWith('sec_filings');
        });

        it('saveEnriched8k_usesDeterministicDocIdSoRetriesOverwriteRatherThanDuplicate', async () => {
            await repository.saveEnriched8k({ filing, enriched, companyName: 'Apple', link: filing.finalLink });
            await repository.saveEnriched8k({ filing, enriched, companyName: 'Apple', link: filing.finalLink });

            // Both writes target the same filing-derived document id — no duplicate docs on retry.
            expect(mockDoc).toHaveBeenNthCalledWith(1, expectedDocId);
            expect(mockDoc).toHaveBeenNthCalledWith(2, expectedDocId);
            expect(mockAdd).not.toHaveBeenCalled();
            expect(mockDocSet).toHaveBeenCalledTimes(2);
        });

        it('saveEnriched8k_persistsEnrichedFilingShape', async () => {
            await repository.saveEnriched8k({ filing, enriched, companyName: 'Apple', link: filing.finalLink });

            expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
                symbol: 'AAPL',
                companyName: 'Apple',
                formType: '8-K',
                topic: 'M&A',
                summary: 'Apple buys startup.',
                filingDate: '2023-10-01',
                link: 'http://final_link'
            }));
        });
    });

    describe('save', () => {
        const financialFiling: SecFiling = {
            symbol: 'AAPL',
            filingDate: '2023-10-01',
            acceptedDate: '2023-10-01',
            link: 'http://link',
            finalLink: 'http://final_link',
            formType: '10-Q',
            cik: '123'
        };

        const financialEnriched: EnrichedFinancialData = {
            revenue: 100000000000,
            eps: 1.5,
            reportingCurrency: 'USD',
            summary: 'Revenue rose on strong iPhone sales.'
        };

        it('save_writesToSecFilingsCollection', async () => {
            // Arrange
            const params = { filing: financialFiling, enriched: financialEnriched, companyName: 'Apple', link: financialFiling.finalLink };

            // Act
            await repository.save(params);

            // Assert
            expect(mockCollection).toHaveBeenCalledWith('sec_filings');
        });

        it('save_usesDeterministicDocIdSoRetriesOverwriteRatherThanDuplicate', async () => {
            // Arrange
            const params = { filing: financialFiling, enriched: financialEnriched, companyName: 'Apple', link: financialFiling.finalLink };

            // Act
            await repository.save(params);
            await repository.save(params);

            // Assert
            expect(mockDoc).toHaveBeenNthCalledWith(1, expectedDocId);
            expect(mockDoc).toHaveBeenNthCalledWith(2, expectedDocId);
            expect(mockAdd).not.toHaveBeenCalled();
            expect(mockDocSet).toHaveBeenCalledTimes(2);
        });

        it('save_persistsFinancialReportShape', async () => {
            // Arrange
            const params = { filing: financialFiling, enriched: financialEnriched, companyName: 'Apple', link: financialFiling.finalLink };

            // Act
            await repository.save(params);

            // Assert
            expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({
                symbol: 'AAPL',
                companyName: 'Apple',
                formType: '10-Q',
                revenue: 100000000000,
                eps: 1.5,
                summary: 'Revenue rose on strong iPhone sales.',
                filingDate: '2023-10-01',
                link: 'http://final_link'
            }));
        });

        it('save_setRejects_propagatesError', async () => {
            // Arrange
            const params = { filing: financialFiling, enriched: financialEnriched, companyName: 'Apple', link: financialFiling.finalLink };
            mockDocSet.mockRejectedValueOnce(new Error('firestore down'));

            // Act & Assert
            await expect(repository.save(params)).rejects.toThrow('firestore down');
        });
    });
});
