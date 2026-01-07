import { Logger } from '../../../core/logger';
import { getRemoteConfig } from '../../../core/remote-config';

const _logger = new Logger('Config Service');

export interface DripMessage {
    title: string;
    body: string;
}

export interface ConfigService {
    getDripCampaign(): Promise<Record<number, DripMessage>>;
}

export class RemoteConfigService implements ConfigService {
    async getDripCampaign(): Promise<Record<string, DripMessage>> {
        const config = await getRemoteConfig();

        try {
            const campaign = JSON.parse(config.subscriptionDripCampaign);
            return campaign;
        } catch (error) {
            _logger.error('Failed to parse drip campaign JSON', error);
            // Return empty object or default fallback? 
            // Default logic is already in core/remote-config.ts, so this SHOULD prevent crashes.
            // But if JSON.parse fails implies raw string was bad. 
            // We'll throw or return empty and let UseCase handle "no message found"
            return {};
        }
    }
}
