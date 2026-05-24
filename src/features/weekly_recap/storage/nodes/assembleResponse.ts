import type { WeeklyRecapState } from '../usecase';
import type { LLMResponse } from '../models';

export function makeAssembleResponseNode() {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { ticker, companyName, counts, priceMovement, llmPartial } = state;

    const content = llmPartial as Required<Pick<LLMResponse,
      'messageTitle' | 'messageShortSummary' | 'messageLongSummary' |
      'confidenceScore' | 'newsLinks' | 'eightKLinks'>>;

    const llmResponse: LLMResponse = {
      ...content,
      time: new Date().toISOString(),
      ticker,
      companyName,
      newArticleCount: counts.newArticleCount,
      eightKCount: counts.eightKCount,
      eodStockPriceCount: counts.eodStockPriceCount,
      priceMovement,
    };

    return { llmResponse };
  };
}
