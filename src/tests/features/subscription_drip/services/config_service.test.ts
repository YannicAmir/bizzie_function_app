
import { RemoteConfigService } from '../../../../features/subscription_drip/services/config_service';
import * as remoteConfigCore from '../../../../core/remote-config';

// Mock the core remote config module
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
        const mockJson = JSON.stringify({
            1: { title: 'Day 1', body: 'Messages' }
        });

        mockGetRemoteConfig.mockResolvedValue({
            subscriptionDripCampaign: mockJson
        });

        const result = await service.getDripCampaign();

        expect(result).toEqual({
            1: { title: 'Day 1', body: 'Messages' }
        });
    });

    it('getDripCampaign_malformedJson_returnsEmpty', async () => {
        mockGetRemoteConfig.mockResolvedValue({
            subscriptionDripCampaign: "{ invalid json "
        });

        const result = await service.getDripCampaign();

        expect(result).toEqual({});
    });

    it('getDripCampaign_missingProp_returnsEmpty', async () => {
        mockGetRemoteConfig.mockResolvedValue({}); // No subscriptionDripCampaign prop

        // The real implementation might throw or return undefined if strict, 
        // but current impl might error on JSON.parse(undefined). 
        // Let's verify behavior. If it throws catch block should handle it.

        const result = await service.getDripCampaign();
        expect(result).toEqual({});
    });
});
