import { UserService } from '../../../../features/subscription_webhook/services/user_service';
import * as admin from 'firebase-admin';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
    const mockSet = jest.fn();
    const mockDoc = jest.fn(() => ({ set: mockSet }));
    const mockCollection = jest.fn(() => ({ doc: mockDoc }));
    const mockFirestore = jest.fn(() => ({ collection: mockCollection }));

    return {
        messaging: jest.fn(),
        firestore: mockFirestore,
        initializeApp: jest.fn(),
        apps: [],
        _mockSet: mockSet,
        _mockDoc: mockDoc,
        _mockCollection: mockCollection,
        _mockFirestore: mockFirestore
    };
});

describe('UserService', () => {
    let userService: UserService;
    const mockAdmin = admin as unknown as {
        _mockSet: jest.Mock;
        _mockDoc: jest.Mock;
        _mockCollection: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        userService = new UserService();
    });

    it('should_updateFirestore_withCorrectData_when_isSubscribedTrue', async () => {
        // Arrange
        const userId = 'user_123';
        const isSubscribed = true;
        const expiryDateMs = 1735497600000;

        // Act
        await userService.updateSubscriptionStatus(userId, isSubscribed, expiryDateMs);

        // Assert
        expect(mockAdmin._mockCollection).toHaveBeenCalledWith('users');
        expect(mockAdmin._mockDoc).toHaveBeenCalledWith(userId);

        const expectedPayload = {
            isSubscribed: true,
            updatedAt: expect.any(String),
            subscriptionExpiryDate: new Date(expiryDateMs).toISOString()
        };

        expect(mockAdmin._mockSet).toHaveBeenCalledWith(expectedPayload, { merge: true });
    });

    it('should_updateFirestore_withoutExpiry_when_expiryNotProvided', async () => {
        // Arrange
        const userId = 'user_456';
        const isSubscribed = false;

        // Act
        await userService.updateSubscriptionStatus(userId, isSubscribed);

        // Assert
        const expectedPayload = {
            isSubscribed: false,
            updatedAt: expect.any(String)
        };

        expect(mockAdmin._mockSet).toHaveBeenCalledWith(expectedPayload, { merge: true });
    });

    it('should_throwError_when_firestoreFails', async () => {
        // Arrange
        const error = new Error('Firestore unavailable');
        mockAdmin._mockSet.mockRejectedValue(error);

        // Act & Assert
        await expect(userService.updateSubscriptionStatus('user_error', true)).rejects.toThrow(error);
    });
});
