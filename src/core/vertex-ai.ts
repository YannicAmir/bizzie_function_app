import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { config } from './config';
import { Logger } from './logger';
const logger = new Logger("VertexAI");

let vertexAiInstance: VertexAI | null = null;

export const getVertexAI = (): VertexAI => {
  if (!vertexAiInstance) {
    logger.info(`Initializing`, { project: config.projectId, location: config.location });
    vertexAiInstance = new VertexAI({
      project: config.projectId,
      location: config.location,
      // @ts-ignore - Required for Preview models
      apiEndpoint: 'aiplatform.googleapis.com',
      // @ts-ignore - Required for Preview models
      apiVersion: 'v1beta1',
    });
  }
  return vertexAiInstance;
};

export const getGeminiModel = (modelName: string): GenerativeModel => {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({ model: modelName });
};
