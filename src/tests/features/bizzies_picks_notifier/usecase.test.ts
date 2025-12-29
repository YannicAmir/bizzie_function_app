import { BizziesPicksNotifierUseCase } from '../../../../src/features/bizzies_picks_notifier/usecase';
import { NotificationService } from '../../../../src/core/services/notification_service';

describe('BizziesPicksNotifierUseCase', () => {
    let useCase: BizziesPicksNotifierUseCase;
    let mockNotificationService: jest.Mocked<NotificationService>;

    beforeEach(() => {
        mockNotificationService = {
            sendTopicNotification: jest.fn(),
            sendToToken: jest.fn(),
            subscribeToTopic: jest.fn(),
            unsubscribeFromTopic: jest.fn(),
        };

        useCase = new BizziesPicksNotifierUseCase(mockNotificationService);
    });

    it('should_sendNotificationToPremiumTopic_when_executed', async () => {
        // Arrange
        const expectedTopic = 'premium_notifications';
        const expectedTitle = "Bizzie's picks are now available! 👀";
        const expectedBody = "See what companies, brands, and products Bizzie is researching today";
        const expectedData = {
            type: 'bizzies_picks_daily',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        };

        mockNotificationService.sendTopicNotification.mockResolvedValue();

        // Act
        await useCase.execute();

        // Assert
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledTimes(1);
        expect(mockNotificationService.sendTopicNotification).toHaveBeenCalledWith(
            expectedTopic,
            expectedTitle,
            expectedBody,
            expectedData
        );
    });

    it('should_propagateError_when_notificationServiceFails', async () => {
        // Arrange
        const error = new Error('Network error');
        mockNotificationService.sendTopicNotification.mockRejectedValue(error);

        // Act & Assert
        await expect(useCase.execute()).rejects.toThrow(error);
    });
});
