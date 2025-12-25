import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { config } from './config';

let vertexAiInstance: VertexAI | null = null;

export const getVertexAI = (): VertexAI => {
  if (!vertexAiInstance) {
    vertexAiInstance = new VertexAI({
      project: config.projectId,
      location: config.location,
    });
  }
  return vertexAiInstance;
};

export const getGeminiModel = (modelName: string = 'gemini-1.5-flash'): GenerativeModel => {
  const vertex = getVertexAI();
  return vertex.getGenerativeModel({ model: modelName });
};
