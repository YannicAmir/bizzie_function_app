import { FirebaseFilingHistoryService } from '../../../core/services/filing_history_service';
import { SecFiling } from '../../../core/services/sec_service';
import * as firebaseCore from '../../../core/firebase';
import * as crypto from 'crypto';

// Mock Logger
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

// Mock Firebase
jest.mock('../../../core/firebase');

describe('FirebaseFilingHistoryService', () => {
    let service: FirebaseFilingHistoryService;
    let mockGet: jest.Mock;
    let mockSet: jest.Mock;
    let mockDoc: jest.Mock;
    let mockCollection: jest.Mock;

    beforeEach(() => {
        service = new FirebaseFilingHistoryService();

        // Setup chained mocks
        mockGet = jest.fn();
        mockSet = jest.fn();
        mockDoc = jest.fn(() => ({
            get: mockGet,
            set: mockSet
        }));
        mockCollection = jest.fn(() => ({
            doc: mockDoc
        }));

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => ({
                collection: mockCollection
            })
        });
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

    const expectedHash = crypto.createHash('sha256').update('http://final_link').digest('hex');

    describe('hasProcessed', () => {
        it('returns true if document exists', async () => {
            // Arrange
            mockGet.mockResolvedValue({ exists: true });

            // Act
            const result = await service.hasProcessed(mockFiling);

            // Assert
            expect(result).toBe(true);
            expect(mockCollection).toHaveBeenCalledWith('processed_filings');
            expect(mockDoc).toHaveBeenCalledWith(expectedHash);
        });

        it('returns false if document does not exist', async () => {
            // Arrange
            mockGet.mockResolvedValue({ exists: false });

            // Act
            const result = await service.hasProcessed(mockFiling);

            // Assert
            expect(result).toBe(false);
        });

        it('returns true (skips check) if no finalLink', async () => {
            // Arrange
            const badFiling = { ...mockFiling, finalLink: '' };
            // Act
            const result = await service.hasProcessed(badFiling);
            // Assert
            expect(result).toBe(true);
            expect(mockGet).not.toHaveBeenCalled();
        });
    });

    describe('markProcessed', () => {
        it('sets document in firestore', async () => {
            // Arrange
            mockSet.mockResolvedValue({});

            // Act
            await service.markProcessed(mockFiling);

            // Assert
            expect(mockDoc).toHaveBeenCalledWith(expectedHash);
            expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
                symbol: 'AAPL',
                originalLink: 'http://final_link',
                processedAt: expect.any(String)
            }));
        });

        it('does nothing if no finalLink', async () => {
            // Arrange
            const badFiling = { ...mockFiling, finalLink: '' };
            // Act
            await service.markProcessed(badFiling);
            // Assert
            expect(mockSet).not.toHaveBeenCalled();
        });
    });
});
