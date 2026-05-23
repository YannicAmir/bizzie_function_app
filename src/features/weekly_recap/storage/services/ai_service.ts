import { traceCallback } from '@confident-ai/deepeval';
import { getGeminiModel } from '../../../../core/vertex-ai';
import { getRemoteConfig } from '../../../../core/remote-config';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { LLMResponse, SummarizeNewsInput } from '../models';
import { isRetryableLlmError, truncateToTokens, stripMarkdown, isValidLLMPartial } from '../helpers/llm';
import { FEATURE_NAME } from '../constants';
import type { EvaluationService } from './evaluation_service';

const logger = new Logger('WeeklyRecap/Storage/AiService');

export const SUMMARIZE_NEWS_PROMPT = `You are a financial analyst writing a concise weekly market summary for retail investors.

Ticker: {ticker}
Company: {companyName}
Week: {startDate} to {endDate}

## Price Movement
Start price: {startPrice}
End price: {endPrice}
Price change: {priceChange}
Price change %: {priceChangePercent}

## News Articles
{news}

## Press Releases
{pressReleases}

## SEC 8-K Filings
{filings}

## Historical Prices (EOD)
{prices}

## Instructions
Return a JSON object with ONLY the following fields:
- messageTitle: string — headline ≤ 50 characters, must fit an Apple push notification title
- messageShortSummary: string — 2–3 sentences, ≤ 150 characters, must be fully visible in an Apple push notification body
- messageLongSummary: string — concise and catchy narrative for an engaged reader; no hard character limit but keep it tight
- confidenceScore: integer — your self-assessed confidence score from 0 to 100
- newsLinks: string[] — URLs from the news articles provided
- pressReleaseLinks: string[] — URLs from the press releases provided
- eightKLinks: string[] — finalLink URLs from the 8-K filings provided

CRITICAL RULES:
1. NEVER imply or state that price changes were caused by any particular news item, press release, or filing. Causation is never stated.
2. If any source data is missing or sparse, omit that aspect entirely — do not fabricate or speculate.
3. Price movement and news/filings are summarized separately within the same output.
4. messageTitle MUST be ≤ 50 characters.
5. messageShortSummary MUST be ≤ 150 characters.

Return ONLY valid JSON. No markdown fences. No explanatory text.`;

export class AiService {
  constructor(private readonly evaluation?: EvaluationService) {}

  async summarizeNews(input: SummarizeNewsInput): Promise<Partial<LLMResponse>> {
    const { ticker, companyName, news, pressReleases, filings, prices, priceMovement, startDate, endDate } = input;

    const appConfig = await getRemoteConfig();
    const modelName = appConfig.weekly_recap.model;

    const newsText =
      news
        .map((n) => `Title: ${n.title}\nDate: ${n.publishedDate}\nURL: ${n.url}\n${truncateToTokens(n.text, 500)}`)
        .join('\n\n') || '(none)';

    const prText =
      pressReleases
        .map((pr) => `Title: ${pr.title}\nDate: ${pr.publishedDate}\nURL: ${pr.url}\n${truncateToTokens(pr.text, 750)}`)
        .join('\n\n') || '(none)';

    const filingsText =
      filings
        .map((f) => `Title: ${f.title}\nDate: ${f.filingDate}\nForm: ${f.formType}\nLink: ${f.link}\nFinalLink: ${f.finalLink}`)
        .join('\n\n') || '(none)';

    const pricesText =
      prices.map((p) => `Date: ${p.date}, Price: ${p.price}, Volume: ${p.volume}`).join('\n') || '(none)';

    const prompt = SUMMARIZE_NEWS_PROMPT
      .replace('{ticker}', ticker)
      .replace('{companyName}', companyName)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{startPrice}', priceMovement.startPrice !== null ? String(priceMovement.startPrice) : 'N/A')
      .replace('{endPrice}', priceMovement.endPrice !== null ? String(priceMovement.endPrice) : 'N/A')
      .replace('{priceChange}', priceMovement.priceChange !== null ? String(priceMovement.priceChange) : 'N/A')
      .replace('{priceChangePercent}', priceMovement.priceChangePercent !== null ? String(priceMovement.priceChangePercent) : 'N/A')
      .replace('{news}', newsText)
      .replace('{pressReleases}', prText)
      .replace('{filings}', filingsText)
      .replace('{prices}', pricesText);

    logger.debug('Sending prompt to LLM', { prompt });

    const model = getGeminiModel(modelName);
    const evaluation = this.evaluation;

    const startTime = Date.now();

    const result = await retry(
      async () => {
        const runGenerate = () =>
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          });

        const response = await (evaluation?.isInitialized
          ? traceCallback(runGenerate, {
              model: modelName,
              traceAttributes: { ticker, feature: FEATURE_NAME },
            })
          : runGenerate());

        const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          logger.warn(`LLM returned empty response for ${ticker}`);
          throw new Error('Empty LLM response');
        }

        logger.debug('Raw LLM response', { text });

        const usage = response.response.usageMetadata;
        if (usage) {
          logger.info('Token usage', {
            promptTokenCount: usage.promptTokenCount,
            candidatesTokenCount: usage.candidatesTokenCount,
            totalTokenCount: usage.totalTokenCount,
          });
        }

        const parsed = JSON.parse(text) as Partial<LLMResponse>;
        if (!isValidLLMPartial(parsed)) {
          logger.warn(`LLM returned invalid schema for ${ticker}`, { parsed });
          throw new Error('Invalid LLM response schema');
        }

        return parsed;
      },
      {
        maxAttempts: 3,
        initialDelayMs: 2000,
        backoffFactor: 2,
        maxDelayMs: 30000,
        shouldRetry: isRetryableLlmError,
      },
    );

    const durationMs = Date.now() - startTime;
    logger.info(`LLM summary generated for ${ticker} in ${durationMs}ms`, { modelName });

    return result;
  }

  postProcessLlmSummary(response: LLMResponse): LLMResponse {
    const originalTitleLength = response.messageTitle.length;
    const truncatedTitle = response.messageTitle.slice(0, 50);

    if (originalTitleLength > 50) {
      logger.info(`messageTitle truncated for ${response.ticker}: ${originalTitleLength} → 50 chars`);
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
