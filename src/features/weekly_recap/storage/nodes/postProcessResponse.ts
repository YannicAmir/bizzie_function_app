import type { AiService } from '../services/ai_service';
import type { WeeklyRecapState } from '../usecase';

export function makePostProcessResponseNode(ai: AiService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const llmResponse = ai.postProcessLlmSummary(state.llmResponse);
    return { llmResponse };
  };
}
