import { observe, SpanType, updateCurrentSpan } from 'deepeval/tracing';
import { ChatVertexAI } from '@langchain/google-vertexai';
import type { BaseMessage } from '@langchain/core/messages';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { getRemoteConfig } from '../../../../core/remote-config';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import { loadChatPrompt } from '../../../../core/prompts';
import type { LLMResponse, SummarizeNewsInput } from '../models';
import { isRetryableLlmError, stripMarkdown, isValidLLMPartial } from '../helpers/llm';
import type { EvaluationService } from './evaluation_service';
import { SUMMARIZE_NEWS_SYSTEM_PROMPT, SUMMARIZE_NEWS_USER_TEMPLATE } from '../prompts/storage_prompts';

const logger = new Logger('WeeklyRecap/Storage/AiService');
const MAX_PUSH_TITLE_LENGTH = 50;
const MAX_LOG_PREVIEW_LENGTH = 200;
const LLM_RETRY_MAX_ATTEMPTS = 3;
const LLM_RETRY_INITIAL_DELAY_MS = 2000;
const LLM_RETRY_BACKOFF_FACTOR = 2;
const LLM_RETRY_MAX_DELAY_MS = 30_000;

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    messageTitle:        { type: 'string' as const },
    messageShortSummary: { type: 'string' as const },
    messageLongSummary:  { type: 'string' as const },
    confidenceScore:     { type: 'integer' as const },
    newsLinks:           { type: 'array' as const, items: { type: 'string' as const } },
    eightKLinks:         { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['messageTitle', 'messageShortSummary', 'messageLongSummary', 'confidenceScore', 'newsLinks', 'eightKLinks'],
};

function buildContextTexts(input: SummarizeNewsInput): { newsText: string; filingsText: string; pricesText: string } {
  const newsText =
    input.news
      .map((n) => `Title: ${n.title}\nDate: ${n.publishedDate}\nURL: ${n.url}\n${n.text}`)
      .join('\n\n') || '(none)';

  const filingsText =
    input.filings
      .map((f) => `Title: ${f.title}\nDate: ${f.filingDate}\nForm: ${f.formType}\nLink: ${f.link}\nFinalLink: ${f.finalLink}`)
      .join('\n\n') || '(none)';

  const pricesText =
    input.prices.map((p) => `Date: ${p.date}, Price: ${p.price}, Volume: ${p.volume}`).join('\n') || '(none)';

  return { newsText, filingsText, pricesText };
}

async function invokeModel(
  model: ChatVertexAI,
  messages: BaseMessage[],
  ticker: string,
  context: { newsText: string; filingsText: string },
  evaluation: EvaluationService | undefined,
): Promise<Partial<LLMResponse>> {
  const runGenerate = async (msgs: BaseMessage[]) => {
    const response = await model.invoke(msgs, { callbacks: [new LangChainTracer()] });
    const text = typeof response.content === 'string' ? response.content : '';
    if (evaluation?.isInitialized) {
      updateCurrentSpan({
        retrievalContext: [context.newsText, context.filingsText].filter((s) => s !== '(none)'),
        output: text,
      });
    }
    const usage = response.usage_metadata as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
    if (usage) {
      logger.info('Token usage', {
        promptTokenCount: usage.input_tokens,
        candidatesTokenCount: usage.output_tokens,
        totalTokenCount: usage.total_tokens,
      });
    }
    return text;
  };

  const text = await (evaluation?.isInitialized
    ? observe({ type: SpanType.LLM, name: 'summarizeNews', model: model.modelName, metricCollection: 'weekly-recap-summary', fn: runGenerate })(messages)
    : runGenerate(messages));

  if (!text) {
    logger.warn(`LLM returned empty response for ${ticker}`);
    throw new Error('Empty LLM response');
  }

  logger.debug('Raw LLM response', { text });

  let parsed: Partial<LLMResponse>;
  try {
    parsed = JSON.parse(text) as Partial<LLMResponse>;
  } catch {
    logger.warn(`LLM returned invalid JSON for ${ticker}`, { preview: text.slice(0, MAX_LOG_PREVIEW_LENGTH) });
    throw new Error('Invalid LLM JSON response');
  }

  if (!isValidLLMPartial(parsed)) {
    logger.warn(`LLM returned invalid schema for ${ticker}`, { parsed });
    throw new Error('Invalid LLM response schema');
  }

  return parsed;
}

export class AiService {
  private cachedModel?: ChatVertexAI;

  constructor(private readonly evaluation?: EvaluationService) {}

  private async getModel(): Promise<ChatVertexAI> {
    if (!this.cachedModel) {
      const appConfig = await getRemoteConfig();
      this.cachedModel = new ChatVertexAI({
        model: appConfig.weekly_recap.model,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        endpoint: 'aiplatform.googleapis.com',
      });
    }
    return this.cachedModel;
  }

  async summarizeNews(input: SummarizeNewsInput): Promise<Partial<LLMResponse>> {
    const { ticker, companyName, startDate, endDate, priceMovement } = input;
    const model = await this.getModel();
    const { newsText, filingsText, pricesText } = buildContextTexts(input);
    const evaluation = this.evaluation;

    const runSummarize = async () => {
      const messages = await loadChatPrompt(
        'summarize-news-prompt',
        SUMMARIZE_NEWS_SYSTEM_PROMPT,
        SUMMARIZE_NEWS_USER_TEMPLATE,
        {
          ticker, companyName, startDate, endDate,
          startPrice: priceMovement.startPrice !== null ? String(priceMovement.startPrice) : 'N/A',
          endPrice: priceMovement.endPrice !== null ? String(priceMovement.endPrice) : 'N/A',
          priceChange: priceMovement.priceChange !== null ? String(priceMovement.priceChange) : 'N/A',
          priceChangePercent: priceMovement.priceChangePercent !== null ? String(priceMovement.priceChangePercent) : 'N/A',
          news: newsText, filings: filingsText, prices: pricesText,
        },
      );
      logger.debug('Sending prompt to LLM', { messages });
      const startTime = Date.now();
      const result = await retry(
        () => invokeModel(model, messages, ticker, { newsText, filingsText }, evaluation),
        {
          maxAttempts: LLM_RETRY_MAX_ATTEMPTS,
          initialDelayMs: LLM_RETRY_INITIAL_DELAY_MS,
          backoffFactor: LLM_RETRY_BACKOFF_FACTOR,
          maxDelayMs: LLM_RETRY_MAX_DELAY_MS,
          shouldRetry: isRetryableLlmError,
        },
      );
      const durationMs = Date.now() - startTime;
      logger.info(`LLM summary generated for ${ticker} in ${durationMs}ms`, { modelName: model.modelName });
      return result;
    };

    return evaluation?.isInitialized
      ? observe({ type: SpanType.AGENT, name: `weeklyRecap-${ticker}`, fn: runSummarize })()
      : runSummarize();
  }

  postProcessLlmSummary(response: LLMResponse): LLMResponse {
    const originalTitleLength = response.messageTitle.length;
    const truncatedTitle = response.messageTitle.slice(0, MAX_PUSH_TITLE_LENGTH);

    if (originalTitleLength > MAX_PUSH_TITLE_LENGTH) {
      logger.info(`messageTitle truncated for ${response.ticker}: ${originalTitleLength} → ${MAX_PUSH_TITLE_LENGTH} chars`);
    }

    const shortSummary = stripMarkdown(response.messageShortSummary.trim());
    const longSummary = stripMarkdown(response.messageLongSummary.trim());

    if (longSummary !== response.messageLongSummary.trim() || shortSummary !== response.messageShortSummary.trim()) {
      logger.debug(`Stripped markdown artefacts from summary for ${response.ticker}`);
    }

    return {
      ...response,
      messageTitle: truncatedTitle.trim(),
      messageShortSummary: shortSummary,
      messageLongSummary: longSummary,
    };
  }
}
