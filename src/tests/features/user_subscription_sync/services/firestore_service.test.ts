import { FirestoreService } from '../../../../features/user_subscription_sync/services/firestore_service';
import * as admin from 'firebase-admin';

jest.mock('firebase-admin', () => {
    const mockUpdate = jest.fn();
    const mockDoc = jest.fn(() => ({ update: mockUpdate }));
    const mockCollection = jest.fn(() => ({ doc: mockDoc }));
    const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

    const mockDelete = jest.fn(() => 'DELETE_SENTINEL');

    return {
        messaging: jest.fn(),
        firestore: Object.assign(mockFirestore, { FieldValue: { delete: mockDelete } }),
        initializeApp: jest.fn(),
        apps: [],
        _mockUpdate: mockUpdate,
        _mockDoc: mockDoc,
        _mockCollection: mockCollection,
        _mockDelete: mockDelete
    };
});

jest.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        delete: jest.fn(() => 'DELETE_SENTINEL')
    }
}));

describe('FirestoreService', () => {
    let service: FirestoreService;
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
        // Arrange
        const userId = 'user_123';
        const deviceId = 'device_ABC';

        // Act
        await service.removeStaleToken(userId, deviceId);

        // Assert
        expect(mockAdmin._mockCollection).toHaveBeenCalledWith('users');
        expect(mockAdmin._mockDoc).toHaveBeenCalledWith(userId);

        expect(mockAdmin._mockUpdate).toHaveBeenCalledWith({
            [`fcmTokens.${deviceId}`]: 'DELETE_SENTINEL'
        });
    });

    it('should_catchAndLog_when_updateFails', async () => {
        // Arrange
        const error = new Error('Firestore error');
        mockAdmin._mockUpdate.mockRejectedValue(error);

        // Act
        await service.removeStaleToken('user_1', 'device_1');

        // Assert
        expect(mockAdmin._mockUpdate).toHaveBeenCalled();
    });
});
