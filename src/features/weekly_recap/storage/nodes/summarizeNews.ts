import { Logger } from '../../../../core/logger';
import { truncateToTokens } from '../helpers/llm';
import type { AiService } from '../services/ai_service';
import type { WeeklyRecapState } from '../usecase';

const logger = new Logger('WeeklyRecap/Storage/Node/SummarizeNews');

const MAX_NEWS_TOKENS_PER_ITEM = 500;

export function makeSummarizeNewsNode(ai: AiService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { ticker, companyName, news, filings, prices, priceMovement, startDate, endDate } = state;

    try {
      const truncatedNews = news.map((n) => ({ ...n, text: truncateToTokens(n.text, MAX_NEWS_TOKENS_PER_ITEM) }));
      const llmPartial = await ai.summarizeNews({
        ticker, companyName, news: truncatedNews, filings, prices, priceMovement, startDate, endDate,
      });
      return { llmPartial };
    } catch (err) {
      logger.error('summarizeNews failed', {
        ticker,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}
