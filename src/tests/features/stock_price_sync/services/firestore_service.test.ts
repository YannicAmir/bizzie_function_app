import { FieldValue } from 'firebase-admin/firestore';
import { FirestoreService } from '../../../../features/stock_price_sync/services/firestore_service';
import { getFirebaseAdmin } from '../../../../core/firebase';
import { PriceSnapshot } from '../../../../features/stock_price_sync/models/PriceSnapshot';

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
    FieldValue: {
        serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP')
    }
}));

const makeSnapshot = (overrides: Partial<PriceSnapshot> = {}): PriceSnapshot => ({
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    price: 104,
    previousClose: 100,
    change: 4,
    changePercent: 4,
    sessionDate: '2026-01-06',
    series: [{ t: '09:31', c: 104 }],
    latestBarAt: '2026-01-06 09:31:00',
    closeFinalized: false,
    ...overrides
});

describe('FirestoreService', () => {
    let service: FirestoreService;
    let mockDocRef: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockDoc: jest.Mock;
    let mockCollection: jest.Mock;
    let mockDb: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockDocRef = { set: jest.fn().mockResolvedValue(undefined) };
        mockDoc = jest.fn().mockReturnValue(mockDocRef);
        mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });
        mockDb = { collection: mockCollection };
        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            firestore: () => mockDb
        });
        service = new FirestoreService();
    });

    it('upsertPrice_validSnapshot_writesPayloadWithServerTimestamp', async () => {
        // Arrange
        const snapshot = makeSnapshot();

        // Act
        await service.upsertPrice(snapshot);

        // Assert
        expect(mockCollection).toHaveBeenCalledWith('stock_prices');
        expect(mockDoc).toHaveBeenCalledWith('AAPL');
        expect(mockDocRef.set).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker: 'AAPL',
                price: 104,
                previousClose: 100,
                sessionDate: '2026-01-06',
                latestBarAt: '2026-01-06 09:31:00',
                updatedAt: 'SERVER_TIMESTAMP'
            })
        );
        expect(FieldValue.serverTimestamp).toHaveBeenCalledTimes(1);
    });

    it('upsertPrice_missingTicker_throwsError', async () => {
        // Arrange
        const snapshot = makeSnapshot({ ticker: '' });

        // Act & Assert
        await expect(service.upsertPrice(snapshot)).rejects.toThrow(
            'upsertPrice: snapshot.ticker is required'
        );
        expect(mockDocRef.set).not.toHaveBeenCalled();
    });

    it('upsertPrice_setFails_rethrows', async () => {
        // Arrange
        mockDocRef.set.mockRejectedValue(new Error('write failed'));

        // Act & Assert
        await expect(service.upsertPrice(makeSnapshot())).rejects.toThrow('write failed');
    });
});
