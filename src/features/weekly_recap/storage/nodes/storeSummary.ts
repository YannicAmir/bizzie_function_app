import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { FirestoreService } from '../services/firestore_service';
import type { WeeklyRecapState } from '../usecase';

const logger = new Logger('WeeklyRecap/Storage/Node/StoreSummary');

export function makeStoreSummaryNode(db: FirestoreService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const { llmResponse } = state;
    try {
      await retry(
        () => db.storeSummaryInDb(llmResponse),
        { maxAttempts: 3, initialDelayMs: 1000, backoffFactor: 2, maxDelayMs: 10000 },
      );
    } catch (err) {
      logger.error('storeSummaryInDb failed after retries', {
        ticker: llmResponse.ticker,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    return {};
  };
}
