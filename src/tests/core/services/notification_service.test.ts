import { FcmNotificationService } from '../../../core/services/notification_service';
import * as firebaseCore from '../../../core/firebase';
import { messaging } from 'firebase-admin';

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

describe('FcmNotificationService', () => {
    let service: FcmNotificationService;
    let mockMessaging: jest.Mock;
    let mockSend: jest.Mock;

    beforeEach(() => {
        service = new FcmNotificationService();
        mockSend = jest.fn();
        mockMessaging = jest.fn(() => ({
            send: mockSend
        }));

        (firebaseCore.getFirebaseAdmin as jest.Mock).mockReturnValue({
            messaging: mockMessaging
        });
    });

    describe('sendTopicNotification', () => {
        it('sends message successfully', async () => {
            mockSend.mockResolvedValue('msg-id');

            await service.sendTopicNotification('test-topic', 'Title', 'Body');

            expect(mockSend).toHaveBeenCalledWith({
                topic: 'test-topic',
                notification: {
                    title: 'Title',
                    body: 'Body'
                },
                data: {}
            });
        });

        it('handles errors gracefully (does not throw)', async () => {
            mockSend.mockRejectedValue(new Error('FCM Error'));

            await expect(service.sendTopicNotification('test-topic', 'Title', 'Body')).resolves.not.toThrow();
        });
    });

    describe('sendToToken', () => {
        it('sends message to token successfully', async () => {
            mockSend.mockResolvedValue('msg-id');

            await service.sendToToken('test-token', 'Private Title', 'Private Body');

            expect(mockSend).toHaveBeenCalledWith({
                token: 'test-token',
                notification: {
                    title: 'Private Title',
                    body: 'Private Body'
                },
                data: {}
            });
        });

        it('handles errors gracefully', async () => {
            mockSend.mockRejectedValue(new Error('Invalid Token'));
            await expect(service.sendToToken('bad-token', 'T', 'B')).resolves.not.toThrow();
        });
    });
});
