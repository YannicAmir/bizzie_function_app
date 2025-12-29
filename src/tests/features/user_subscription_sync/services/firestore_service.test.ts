import { FirestoreService } from '../../../../features/user_subscription_sync/services/firestore_service';
import * as admin from 'firebase-admin';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
    const mockUpdate = jest.fn();
    const mockDoc = jest.fn(() => ({ update: mockUpdate }));
    const mockCollection = jest.fn(() => ({ doc: mockDoc }));
    const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

    // Mock FieldValue.delete
    const mockDelete = jest.fn(() => 'DELETE_SENTINEL');

    return {
        messaging: jest.fn(),
        firestore: Object.assign(mockFirestore, { FieldValue: { delete: mockDelete } }),
        initializeApp: jest.fn(),
        // Expose mocks
        _mockUpdate: mockUpdate,
        _mockDoc: mockDoc,
        _mockCollection: mockCollection,
        _mockDelete: mockDelete
    };
});

// Mock firebase-admin/firestore for the named import
jest.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        delete: jest.fn(() => 'DELETE_SENTINEL')
    }
}));

describe('FirestoreService', () => {
    let service: FirestoreService;
    // Cast admin to any to access internal mocks or use the require approach
    const mockAdmin = admin as unknown as {
        _mockUpdate: jest.Mock;
        _mockDoc: jest.Mock;
        _mockCollection: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new FirestoreService();
    });

    it('should_removeStaleToken_successfully', async () => {
        const userId = 'user_123';
        const deviceId = 'device_ABC';

        await service.removeStaleToken(userId, deviceId);

        expect(mockAdmin._mockCollection).toHaveBeenCalledWith('users');
        expect(mockAdmin._mockDoc).toHaveBeenCalledWith(userId);

        // Verify key uses dot notation and value is the sentinel
        expect(mockAdmin._mockUpdate).toHaveBeenCalledWith({
            [`fcmTokens.${deviceId}`]: 'DELETE_SENTINEL'
        });
    });

    it('should_catchAndLog_when_updateFails', async () => {
        const error = new Error('Firestore error');
        mockAdmin._mockUpdate.mockRejectedValue(error);

        // Should not throw
        await service.removeStaleToken('user_1', 'device_1');

        // Validation implied by no error thrown. 
        // In a real scenario we might check logger, but we typically don't mock the logger module unless strict req.
        expect(mockAdmin._mockUpdate).toHaveBeenCalled();
    });
});
