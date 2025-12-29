import { SubscriptionWebhookUseCase, WebhookPayload } from '../../../../src/features/subscription_webhook/usecase';
import { UserService } from '../../../../src/features/subscription_webhook/services/user_service';

describe('SubscriptionWebhookUseCase', () => {
    let useCase: SubscriptionWebhookUseCase;
    let mockUserService: jest.Mocked<UserService>;

    beforeEach(() => {
        mockUserService = {
            updateSubscriptionStatus: jest.fn(),
        } as unknown as jest.Mocked<UserService>;

        useCase = new SubscriptionWebhookUseCase(mockUserService);
    });

    const createPayload = (type: string, userId: string = 'test_user', expiry: number = 10000): WebhookPayload => ({
        event: {
            type,
            app_user_id: userId,
            expiration_at_ms: expiry,
        },
        api_version: '1.0'
    });

    it('should_setSubscribedTrue_when_initialPurchase', async () => {
        const payload = createPayload('INITIAL_PURCHASE');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).toHaveBeenCalledWith('test_user', true, 10000);
    });

    it('should_setSubscribedTrue_when_renewal', async () => {
        const payload = createPayload('RENEWAL');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).toHaveBeenCalledWith('test_user', true, 10000);
    });

    it('should_setSubscribedTrue_when_uncancellation', async () => {
        const payload = createPayload('UNCANCELLATION');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).toHaveBeenCalledWith('test_user', true, 10000);
    });

    it('should_setSubscribedFalse_when_expiration', async () => {
        const payload = createPayload('EXPIRATION');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).toHaveBeenCalledWith('test_user', false, 10000);
    });

    it('should_notUpdateStatus_when_cancellation', async () => {
        // Cancellation means auto-renew off, access remains.
        const payload = createPayload('CANCELLATION');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).not.toHaveBeenCalled();
    });

    it('should_notUpdateStatus_when_userIdMissing', async () => {
        const payload = createPayload('INITIAL_PURCHASE', '');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).not.toHaveBeenCalled();
    });

    it('should_logAndIgnore_when_unhandledType', async () => {
        const payload = createPayload('UNKNOWN_TYPE');
        await useCase.execute(payload);
        expect(mockUserService.updateSubscriptionStatus).not.toHaveBeenCalled();
    });
});
