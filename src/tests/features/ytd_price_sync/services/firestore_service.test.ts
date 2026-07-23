import { FieldValue } from 'firebase-admin/firestore';
import { FirestoreService } from '../../../../features/ytd_price_sync/services/firestore_service';
import { getFirebaseAdmin } from '../../../../core/firebase';
import { YtdChangeSnapshot } from '../../../../features/ytd_price_sync/models/YtdChangeSnapshot';

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

const makeSnapshot = (overrides: Partial<YtdChangeSnapshot> = {}): YtdChangeSnapshot => ({
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    year: 2026,
    baselineDate: '2025-12-31',
    baselineClose: 100,
    latestDate: '2026-07-15',
    latestClose: 130,
    ytdChange: 30,
    ytdChangePercent: 30,
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

    it('upsertYtd_validSnapshot_writesPayloadWithServerTimestamp', async () => {
        // Arrange
        const snapshot = makeSnapshot();

        // Act
        await service.upsertYtd(snapshot);

        // Assert
        expect(mockCollection).toHaveBeenCalledWith('ytd_price_change');
        expect(mockDoc).toHaveBeenCalledWith('AAPL');
        expect(mockDocRef.set).toHaveBeenCalledWith(
            expect.objectContaining({
                ticker: 'AAPL',
                companyName: 'Apple Inc.',
                year: 2026,
                baselineClose: 100,
                latestClose: 130,
                ytdChange: 30,
                ytdChangePercent: 30,
                updatedAt: 'SERVER_TIMESTAMP'
            })
        );
        expect(FieldValue.serverTimestamp).toHaveBeenCalledTimes(1);
    });

    it('upsertYtd_missingTicker_throwsError', async () => {
        // Arrange
        const snapshot = makeSnapshot({ ticker: '' });

        // Act & Assert
        await expect(service.upsertYtd(snapshot)).rejects.toThrow(
            'upsertYtd: snapshot.ticker is required'
        );
        expect(mockDocRef.set).not.toHaveBeenCalled();
    });

    it('upsertYtd_setFails_rethrows', async () => {
        // Arrange
        mockDocRef.set.mockRejectedValue(new Error('write failed'));

        // Act & Assert
        await expect(service.upsertYtd(makeSnapshot())).rejects.toThrow('write failed');
    });
});
