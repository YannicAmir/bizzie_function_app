
import { RemoteConfigService } from '../../../../features/subscription_drip/services/config_service';

const mockGetRemoteConfig = jest.fn();

jest.mock('../../../../core/remote-config', () => ({
    getRemoteConfig: () => mockGetRemoteConfig()
}));

jest.mock('../../../../core/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    }))
}));

describe('RemoteConfigService', () => {
    let service: RemoteConfigService;

    beforeEach(() => {
        // Arrange
        service = new RemoteConfigService();
        jest.clearAllMocks();
    });

    it('getDripCampaign_validJson_returnsCampaign', async () => {
        // Arrange
        const mockCampaign = {
            '1': { title: 'Day 1', body: 'Hello' },
            '3': { title: 'Day 3', body: 'Check-in' }
        };
        const mockConfig = {
            subscriptionDripCampaign: JSON.stringify(mockCampaign)
        };
        mockGetRemoteConfig.mockResolvedValue(mockConfig);

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual(mockCampaign);
        expect(mockGetRemoteConfig).toHaveBeenCalled();
    });

    it('getDripCampaign_invalidJson_returnsEmptyObject', async () => {
        // Arrange
        const mockConfig = {
            subscriptionDripCampaign: 'invalid json string'
        };
        mockGetRemoteConfig.mockResolvedValue(mockConfig);

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual({});
    });

    it('getDripCampaign_emptyString_returnsEmptyObject', async () => {
        // Arrange
        const mockConfig = {
            subscriptionDripCampaign: ''
        };
        mockGetRemoteConfig.mockResolvedValue(mockConfig);

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual({});
    });
});
