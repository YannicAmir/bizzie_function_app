import { RevenueCatService } from '../../../../features/subscription_cleanup/services/revenuecat_service';
import { retry } from '../../../../core/retry';

if (typeof global.fetch === 'undefined') {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
}

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
    const mockApiKey = 'sk_test_key';
    const userId = 'user_123';

    beforeEach(() => {
        // Arrange
        jest.clearAllMocks();

        (global.fetch as unknown as jest.Mock) = jest.fn();

        (retry as unknown as jest.Mock).mockImplementation((fn: () => Promise<unknown>) => fn());

        service = new RevenueCatService(mockApiKey);
    });

    it('isUserSubscribed_activeEntitlement_returnsActiveWithLatestExpiry', async () => {
        // Arrange
        const futureDate1 = new Date(Date.now() + 100000).toISOString();
        const futureDate2 = new Date(Date.now() + 200000).toISOString();
        const mockResponse = {
            subscriber: {
                entitlements: {
                    standard: {
                        expires_date: futureDate1,
                        product_identifier: 'std_monthly',
                        purchase_date: new Date().toISOString()
                    },
                    premium: {
                        expires_date: futureDate2,
                        product_identifier: 'pro_annual',
                        purchase_date: new Date().toISOString()
                    }
                }
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result.active).toBe(true);
        expect(result.expiryDate).toBe(futureDate2);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining(userId),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockApiKey}`
                })
            })
        );
    });

    it('isUserSubscribed_infiniteEntitlement_returnsActiveWithNullExpiry', async () => {
        // Arrange
        const mockResponse = {
            subscriber: {
                entitlements: {
                    lifetime: {
                        expires_date: null,
                        product_identifier: 'pro_lifetime',
                        purchase_date: new Date().toISOString()
                    }
                }
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result.active).toBe(true);
        expect(result.expiryDate).toBeNull();
    });

    it('isUserSubscribed_expiredEntitlement_returnsInactiveWithExpiry', async () => {
        // Arrange
        const pastDate = new Date(Date.now() - 100000).toISOString();
        const mockResponse = {
            subscriber: {
                entitlements: {
                    premium: {
                        expires_date: pastDate,
                        product_identifier: 'pro_monthly',
                        purchase_date: new Date(Date.now() - 200000).toISOString()
                    }
                }
            }
        };

        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result.active).toBe(false);
        expect(result.expiryDate).toBe(pastDate);
    });

    it('isUserSubscribed_userNotFound_returnsInactiveWithNullExpiry', async () => {
        // Arrange
        (global.fetch as unknown as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404
        });

        // Act
        const result = await service.isUserSubscribed(userId);

        // Assert
        expect(result.active).toBe(false);
        expect(result.expiryDate).toBeNull();
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
});
