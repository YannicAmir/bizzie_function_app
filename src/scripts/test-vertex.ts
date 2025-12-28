import { getVertexAI } from '../core/vertex-ai';
import { Logger } from '../core/logger';
const _logger = new Logger("Test Script");

async function main() {
    process.env.GCLOUD_PROJECT = 'bizzie-dev-7199b';
    process.env.google_cloud_project = 'bizzie-dev-7199b'; // Just in case
    _logger.info('Testing Vertex AI connection...');
    try {
        const vertex = getVertexAI();
        _logger.info(`Listing models in us-central1...`);
        // @ts-expect-error - listModels is not in the public type definition
        const resp = await vertex.listModels();
        _logger.info('Found models:');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resp.forEach((m: any) => {
            if (m.name.includes('gemini')) {
                _logger.info(`- ${m.name} (${m.versionId})`);
            }
        });
    } catch (error) {
        _logger.error('Failed:', error);
    }
}

main();
