import { FcmService } from '../../../../features/stock_news_notifier/services/fcm_service';
import { NewsNotificationInput } from '../../../../features/stock_news_notifier/models';
import { getFirebaseAdmin } from '../../../../core/firebase';

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

const input: NewsNotificationInput = {
    ticker: 'AAPL',
    title: 'AAPL: 2 new stories',
    body: 'Newest story... and more',
    newsId: 'abc123',
    url: 'https://news.example.com/1',
    count: 2
};

describe('FcmService', () => {
    let service: FcmService;
    let mockSend: jest.Mock;

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();
        mockSend = jest.fn();
        (getFirebaseAdmin as jest.Mock).mockReturnValue({
            messaging: () => ({ send: mockSend })
        });
        service = new FcmService();
    });

    it('sendNewsNotification_success_sendsCoalescedTopicMessage', async () => {
        // Arrange
        mockSend.mockResolvedValue('message-id');

        // Act
        await service.sendNewsNotification(input);

        // Assert
        expect(mockSend).toHaveBeenCalledWith({
            topic: 'AAPL',
            notification: { title: 'AAPL: 2 new stories', body: 'Newest story... and more' },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-collapse-id': 'news_AAPL'
                },
                payload: { aps: { sound: 'default' } }
            },
            android: { collapseKey: 'news_AAPL' },
            data: {
                type: 'stock_news',
                ticker: 'AAPL',
                newsId: 'abc123',
                url: 'https://news.example.com/1',
                count: '2'
            }
        });
    });

    it('sendNewsNotification_sendFails_resolvesWithoutThrowing', async () => {
        // Arrange
        mockSend.mockRejectedValue(new Error('fcm unavailable'));

        // Act & Assert
        await expect(service.sendNewsNotification(input)).resolves.toBeUndefined();
    });
});
