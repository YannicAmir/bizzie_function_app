
import { RemoteConfigService } from '../../../../features/subscription_drip/services/config_service';
import * as remoteConfigCore from '../../../../core/remote-config';

jest.mock('../../../../core/remote-config');

describe('RemoteConfigService', () => {
    let service: RemoteConfigService;
    let mockGetRemoteConfig: jest.Mock;

    beforeEach(() => {
        service = new RemoteConfigService();
        mockGetRemoteConfig = remoteConfigCore.getRemoteConfig as jest.Mock;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('getDripCampaign_success_returnsParsedJson', async () => {
        // Arrange
        const mockJson = JSON.stringify({
            1: { title: 'Day 1', body: 'Messages' }
        });

        mockGetRemoteConfig.mockResolvedValue({
            subscriptionDripCampaign: mockJson
        });

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual({
            1: { title: 'Day 1', body: 'Messages' }
        });
    });

    it('getDripCampaign_malformedJson_returnsEmpty', async () => {
        // Arrange
        mockGetRemoteConfig.mockResolvedValue({
            subscriptionDripCampaign: "{ invalid json "
        });

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual({});
    });

    it('getDripCampaign_missingProp_returnsEmpty', async () => {
        // Arrange
        mockGetRemoteConfig.mockResolvedValue({});

        // Act
        const result = await service.getDripCampaign();

        // Assert
        expect(result).toEqual({});
    });
});
