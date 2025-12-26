import { getGeminiModel, getVertexAI } from '../core/vertex-ai';
import { Logger } from '../core/logger';
const logger = new Logger("Test Script");

async function main() {
    process.env.GCLOUD_PROJECT = 'bizzie-dev-7199b';
    process.env.google_cloud_project = 'bizzie-dev-7199b'; // Just in case
    logger.info('Testing Vertex AI connection...');
    try {
        const vertex = getVertexAI();
        logger.info(`Listing models in us-central1...`);
        // @ts-expect-error - listModels is not in the public type definition
        const resp = await vertex.listModels();
        logger.info('Found models:');
        resp.forEach((m: any) => {
            if (m.name.includes('gemini')) {
                logger.info(`- ${m.name} (${m.versionId})`);
            }
        });
    } catch (error) {
        logger.error('Failed:', error);
    }
}

main();
