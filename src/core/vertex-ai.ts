import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { config } from './config';
import { Logger } from './logger';

const _logger = new Logger("Vertex AI");

let vertexAiInstance: VertexAI | null = null;

export const getVertexAI = (): VertexAI => {
  if (!vertexAiInstance) {
    _logger.info(`Initializing`, { project: config.projectId, location: config.location });
    vertexAiInstance = new VertexAI({
      project: config.projectId,
      location: config.location,
      apiEndpoint: 'aiplatform.googleapis.com',
      // @ts-expect-error - Required for Preview models but missing in type definition
      apiVersion: 'v1beta1',
    });
  }
  return vertexAiInstance;
};

export const getGeminiModel = (modelName: string): GenerativeModel => {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({ model: modelName });
};
