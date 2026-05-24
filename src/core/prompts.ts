import { PromptTemplate, ChatPromptTemplate } from '@langchain/core/prompts';
import type { BaseMessage } from '@langchain/core/messages';
import { Client } from 'langsmith';
import { Logger } from './logger';

const logger = new Logger('Core/Prompts');

function extractStringTemplate(manifest: Record<string, unknown>): string {
  return (manifest.kwargs as Record<string, unknown>)?.template as string ?? '';
}

function extractChatTemplates(manifest: Record<string, unknown>): [string, string] {
  const messages: unknown[] = (manifest.kwargs as Record<string, unknown>)?.messages as unknown[] ?? [];
  const getTemplate = (m: unknown): string => {
    const kwargs = (m as Record<string, unknown>)?.kwargs as Record<string, unknown> | undefined;
    const prompt = kwargs?.prompt as Record<string, unknown> | undefined;
    return (prompt?.kwargs as Record<string, unknown>)?.template as string ?? '';
  };
  return [getTemplate(messages[0]), getTemplate(messages[1])];
}

export async function loadPrompt(
  hubName: string,
  localTemplate: string,
  variables: Record<string, string>,
): Promise<string> {
  if (process.env.LANGSMITH_API_KEY) {
    try {
      const client = new Client();
      const commit = await client.pullPromptCommit(hubName);
      const template = extractStringTemplate(commit.manifest);
      if (!template) throw new Error('Empty template in manifest');
      return PromptTemplate.fromTemplate(template).format(variables);
    } catch (err) {
      logger.warn('LangSmith prompt pull failed — using local fallback', {
        prompt: hubName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return PromptTemplate.fromTemplate(localTemplate).format(variables);
}

export async function loadChatPrompt(
  hubName: string,
  systemTemplate: string,
  userTemplate: string,
  variables: Record<string, string>,
): Promise<BaseMessage[]> {
  if (process.env.LANGSMITH_API_KEY) {
    try {
      const client = new Client();
      const commit = await client.pullPromptCommit(hubName);
      const [pulledSystem, pulledUser] = extractChatTemplates(commit.manifest);
      if (!pulledSystem || !pulledUser) throw new Error('Could not extract message templates from manifest');
      return ChatPromptTemplate.fromMessages([
        ['system', pulledSystem],
        ['human', pulledUser],
      ]).formatMessages(variables);
    } catch (err) {
      logger.warn('LangSmith prompt pull failed — using local fallback', {
        prompt: hubName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return ChatPromptTemplate.fromMessages([
    ['system', systemTemplate],
    ['human', userTemplate],
  ]).formatMessages(variables);
}
