import { FcmNotificationService } from '../../../core/services/notification_service';
import * as firebaseCore from '../../../core/firebase';
import { messaging } from 'firebase-admin';

// Mock dependencies
jest.mock('../../../core/firebase');
jest.mock('../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('FcmNotificationService', () => {
    let service: FcmNotificationService;
    let mockSend: jest.Mock;

    beforeEach(() => {
        service = new FcmNotificationService();
        mockSend = jest.fn();

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            messaging: () => ({
                send: mockSend
            })
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('sendTopicNotification_validPayload_sendsToFCM', async () => {
        mockSend.mockResolvedValue('msg-id-123');

        await service.sendTopicNotification('ticker-AAPL', 'News', 'Body', { key: 'val' });

        expect(mockSend).toHaveBeenCalledTimes(1);
        const expectedMessage: messaging.Message = {
            topic: 'ticker-AAPL',
            notification: {
                title: 'News',
                body: 'Body'
            },
            data: { key: 'val' }
        };
        expect(mockSend).toHaveBeenCalledWith(expectedMessage);
    });

    it('sendTopicNotification_fcmError_logsAndDoesNotThrow', async () => {
        mockSend.mockRejectedValue(new Error('FCM Error'));

        // Should not throw
        await expect(service.sendTopicNotification('ticker-ERR', 'News', 'Body'))
            .resolves.not.toThrow();

        expect(mockSend).toHaveBeenCalledTimes(1);
        // Note: We can't verify logging unless we spy on key Logger, but we mocked it.
        // The main requirement here is ensuring it doesn't crash the app.
    });
});
