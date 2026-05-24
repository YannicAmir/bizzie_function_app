import { FirestoreService } from '../../../../features/weekly_recap/storage/services/firestore_service';
import * as admin from 'firebase-admin';
import type { LLMResponse } from '../../../../features/weekly_recap/storage/models';

jest.mock('firebase-admin', () => {
    const mockGet = jest.fn();
    const mockSet = jest.fn();
    const mockInnerDoc = jest.fn(() => ({ set: mockSet }));
    const mockInnerCollection = jest.fn(() => ({ doc: mockInnerDoc }));
    const mockOuterDoc = jest.fn(() => ({ collection: mockInnerCollection }));
    const mockCollection = jest.fn(() => ({ get: mockGet, doc: mockOuterDoc }));
    const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

    return {
        app: jest.fn(() => ({})),
        initializeApp: jest.fn(),
        apps: [{}],
        firestore: mockFirestore,
        _mockGet: mockGet,
        _mockSet: mockSet,
        _mockCollection: mockCollection,
        _mockOuterDoc: mockOuterDoc,
        _mockInnerCollection: mockInnerCollection,
        _mockInnerDoc: mockInnerDoc,
    };
});

jest.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue('SERVER_TIMESTAMP'),
    },
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    })),
}));

describe('FirestoreService', () => {
    let service: FirestoreService;
    const mockAdmin = admin as unknown as {
        _mockGet: jest.Mock;
        _mockSet: jest.Mock;
        _mockCollection: jest.Mock;
        _mockOuterDoc: jest.Mock;
        _mockInnerCollection: jest.Mock;
        _mockInnerDoc: jest.Mock;
    };

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        service = new FirestoreService();
    });

    describe('retrieveCompaniesFromDb', () => {
        it('retrieveCompaniesFromDb_success_returnsMappedCompanies', async () => {
            // Arrange
            const mockDocs = [
                { data: () => ({ ticker: 'AAPL', companyName: 'Apple Inc.' }) },
                { data: () => ({ ticker: 'MSFT', companyName: 'Microsoft Corp.' }) },
            ];
            mockAdmin._mockGet.mockResolvedValue({ docs: mockDocs });

            // Act
            const result = await service.retrieveCompaniesFromDb();

            // Assert
            expect(result).toEqual([
                { ticker: 'AAPL', companyName: 'Apple Inc.' },
                { ticker: 'MSFT', companyName: 'Microsoft Corp.' },
            ]);
            expect(mockAdmin._mockCollection).toHaveBeenCalledWith('watchlist');
        });

        it('retrieveCompaniesFromDb_missingFields_returnsEmptyStrings', async () => {
            // Arrange
            const mockDocs = [{ data: () => ({}) }];
            mockAdmin._mockGet.mockResolvedValue({ docs: mockDocs });

            // Act
            const result = await service.retrieveCompaniesFromDb();

            // Assert
            expect(result).toEqual([{ ticker: '', companyName: '' }]);
        });

        it('retrieveCompaniesFromDb_firestoreThrows_rethrowsError', async () => {
            // Arrange
            const dbError = new Error('Firestore unavailable');
            mockAdmin._mockGet.mockRejectedValue(dbError);

            // Act & Assert
            await expect(service.retrieveCompaniesFromDb()).rejects.toThrow('Firestore unavailable');
        });
    });

    describe('storeSummaryInDb', () => {
        const buildResponse = (): LLMResponse => ({
            ticker: 'AAPL',
            companyName: 'Apple Inc.',
            time: '2026-05-15T00:00:00.000Z',
            messageTitle: 'Apple up 5%',
            messageShortSummary: 'Solid week for Apple.',
            messageLongSummary: 'Apple had a strong week driven by news.',
            confidenceScore: 85,
            newArticleCount: 3,
            eightKCount: 0,
            eodStockPriceCount: 5,
            newsLinks: ['https://news.com/a'],
            eightKLinks: [],
            priceMovement: { startPrice: 200, endPrice: 210, priceChange: 10, priceChangePercent: 5 },
        });

        it('storeSummaryInDb_success_setsDocumentWithCorrectPath', async () => {
            // Arrange
            const response = buildResponse();
            mockAdmin._mockSet.mockResolvedValue(undefined);

            // Act
            await service.storeSummaryInDb(response);

            // Assert
            expect(mockAdmin._mockCollection).toHaveBeenCalledWith('weekly_recap');
            expect(mockAdmin._mockOuterDoc).toHaveBeenCalledWith('AAPL');
            expect(mockAdmin._mockInnerCollection).toHaveBeenCalledWith('weeks');
            expect(mockAdmin._mockInnerDoc).toHaveBeenCalledWith('2026-05-15');
            expect(mockAdmin._mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    ticker: 'AAPL',
                    time: '2026-05-15T00:00:00.000Z',
                    messageTitle: 'Apple up 5%',
                    confidenceScore: 85,
                    createdAt: 'SERVER_TIMESTAMP',
                }),
            );
        });

        it('storeSummaryInDb_firestoreThrows_rethrowsError', async () => {
            // Arrange
            const response = buildResponse();
            mockAdmin._mockSet.mockRejectedValue(new Error('Write failed'));

            // Act & Assert
            await expect(service.storeSummaryInDb(response)).rejects.toThrow('Write failed');
        });
    });
});
