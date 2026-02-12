import { RevenueCatService } from '../../../../features/subscription_cleanup/services/revenuecat_service';
import { defineSecret } from 'firebase-functions/params';
import { retry } from '../../../../core/retry';

if (typeof global.fetch === 'undefined') {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
}
if (typeof global.AbortController === 'undefined') {
    (global as unknown as { AbortController: unknown }).AbortController = class AbortController {
        signal = { aborted: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
        abort() { this.signal.aborted = true; }
    };
}

jest.mock('firebase-functions/params', () => ({
    defineSecret: jest.fn().mockReturnValue({
        value: () => 'sk_test_key'
    })
}));

jest.mock('../../../../core/retry', () => ({
    retry: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn())
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }))
}));

describe('RevenueCatService', () => {
    let service: RevenueCatService;
    const mockSecretValue = 'sk_test_key';
    const userId = 'user_123';

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();

        (global.fetch as unknown as jest.Mock) = jest.fn();

        (retry as unknown as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

        (defineSecret as jest.Mock).mockReturnValue({
            value: () => mockSecretValue
        });

        service = new RevenueCatService();
    });

    it('isUserSubscribed_activeEntitlement_returnsTrue', async () => {
        // Arrange
        const mockResponse = {
            subscriber: {
                entitlements: {
                    premium: {
                        expires_date: new Date(Date.now() + 100000).toISOString(),
                        product_identifier: 'pro_monthly',
                        purchase_date: new Date().toISOString()
                    }
                }
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
            text: async () => JSON.stringify(mockResponse)
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(userId),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockSecretValue}`
                })
            })
        );
    });

    it('isUserSubscribed_expiredEntitlement_returnsFalse', async () => {
        // Arrange
        const mockResponse = {
            subscriber: {
                entitlements: {
                    premium: {
                        expires_date: new Date(Date.now() - 100000).toISOString(),
                        product_identifier: 'pro_monthly',
                        purchase_date: new Date(Date.now() - 200000).toISOString()
                    }
                }
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
            text: async () => JSON.stringify(mockResponse)
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result).toBe(false);
    });

    it('isUserSubscribed_noEntitlements_returnsFalse', async () => {
        // Arrange
        const mockResponse = {
            subscriber: {
                entitlements: {}
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
            text: async () => JSON.stringify(mockResponse)
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result).toBe(false);
    });

    it('isUserSubscribed_userNotFound_returnsFalse', async () => {
        // Arrange
        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result).toBe(false);
    });

    it('isUserSubscribed_transientError_throwsForRetry', async () => {
        // Arrange
        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });

        // Act & Assert
        await expect(service.isUserSubscribed(userId)).rejects.toThrow('RevenueCat API transient error (500)');
    });

    it('isUserSubscribed_nonTransientError_throwsImmediate', async () => {
        // Arrange
        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'Bad Request'
        });

        // Act & Assert
        await expect(service.isUserSubscribed(userId)).rejects.toThrow('RevenueCat API non-retryable error (400)');
    });

    it('isUserSubscribed_requestTimeout_throws', async () => {
        // Arrange
        const abortError = new Error('The operation was aborted.');
        abortError.name = 'AbortError';

        (global.fetch as unknown as jest.Mock).mockRejectedValue(abortError);

        // Act & Assert
        await expect(service.isUserSubscribed(userId)).rejects.toThrow('The operation was aborted.');
    });
});
