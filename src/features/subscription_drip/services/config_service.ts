import { Logger } from '../../../core/logger';
import { getRemoteConfig } from '../../../core/remote-config';

const _logger = new Logger('Config Service');

export interface DripMessage {
    title: string;
    body: string;
}

export interface ConfigService {
    getDripCampaign(): Promise<Record<string, DripMessage>>;
}

export class RemoteConfigService implements ConfigService {
    async getDripCampaign(): Promise<Record<string, DripMessage>> {
        const config = await getRemoteConfig();

        try {
            const campaign = JSON.parse(config.subscriptionDripCampaign);
            return campaign;
        } catch (error) {
            _logger.error('Failed to parse drip campaign JSON', error);
            return {};
        }
    }
}
