import { traceManager } from 'deepeval/tracing';
import { Logger } from '../../../../core/logger';

const logger = new Logger('WeeklyRecap/Storage/EvaluationService');

export class EvaluationService {
  private _initialized = false;

  get isInitialized(): boolean {
    return this._initialized;
  }

  async init(): Promise<void> {
    if (this._initialized) return;
    try {
      const apiKey = process.env.CONFIDENT_API_KEY ?? '';
      if (apiKey) {
        traceManager.configure({ confidentApiKey: apiKey, tracingEnabled: true });
        this._initialized = true;
      } else {
        logger.warn('CONFIDENT_API_KEY not set — DeepEval tracing disabled');
      }
    } catch (err) {
      logger.warn('DeepEval initialization failed — tracing disabled', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
