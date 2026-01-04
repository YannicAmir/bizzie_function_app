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
        initializeApp: jest.fn(), // If needed by getFirebaseAdmin
        apps: [], // Mock the apps array so checks for length don't crash
        // We also need to expose the mock functions for assertions
        _mockSet: mockSet,
        _mockDoc: mockDoc,
        _mockCollection: mockCollection,
        _mockFirestore: mockFirestore
    };
});

describe('UserService', () => {
    let userService: UserService;
    // Helper to access the mocked functions from the factory above
    // Helper to access the mocked functions from the factory above
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
        const userId = 'user_123';
        const isSubscribed = true;
        const expiryDateMs = 1735497600000; // Some timestamp

        await userService.updateSubscriptionStatus(userId, isSubscribed, expiryDateMs);

        expect(mockAdmin._mockCollection).toHaveBeenCalledWith('users');
        expect(mockAdmin._mockDoc).toHaveBeenCalledWith(userId);

        // Verify payload
        const expectedPayload = {
            isSubscribed: true,
            updatedAt: expect.any(String), // We don't check exact timestamp
            subscriptionExpiryDate: new Date(expiryDateMs).toISOString()
        };

        expect(mockAdmin._mockSet).toHaveBeenCalledWith(expectedPayload, { merge: true });
    });

    it('should_updateFirestore_withoutExpiry_when_expiryNotProvided', async () => {
        const userId = 'user_456';
        const isSubscribed = false;

        await userService.updateSubscriptionStatus(userId, isSubscribed);

        const expectedPayload = {
            isSubscribed: false,
            updatedAt: expect.any(String)
            // No subscriptionExpiryDate
        };

        expect(mockAdmin._mockSet).toHaveBeenCalledWith(expectedPayload, { merge: true });
    });

    it('should_throwError_when_firestoreFails', async () => {
        const error = new Error('Firestore unavailable');
        mockAdmin._mockSet.mockRejectedValue(error);

        await expect(userService.updateSubscriptionStatus('user_error', true)).rejects.toThrow(error);
    });
});
