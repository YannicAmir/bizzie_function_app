import { PubSub } from '@google-cloud/pubsub';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import { AppError } from '../../../../core/errors';
import type { WeeklySummary } from '../models';
import { DELIVERY_TOPIC } from '../constants/pubsub';
import { TRANSIENT_GRPC_CODES } from '../constants/grpc';

const logger = new Logger('WeeklyRecap/Retrieval/PubSubService');

const pubsub = new PubSub();

function isTransientPubSubError(err: unknown): boolean {
  const grpcCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? Number((err as Record<string, unknown>).code)
      : -1;
  return TRANSIENT_GRPC_CODES.includes(grpcCode);
}

const PUBSUB_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: isTransientPubSubError,
};

type WeeklySummaryRaw = Readonly<{
  ticker?: unknown;
  companyName?: unknown;
  weekEndDate?: unknown;
  messageTitle?: unknown;
  messageShortSummary?: unknown;
}>;

export class PubSubService {
  async queueSummaries(summaries: WeeklySummary[]): Promise<void> {
    const topic = pubsub.topic(DELIVERY_TOPIC);
    const startMs = Date.now();

    for (const summary of summaries) {
      const data = Buffer.from(JSON.stringify(summary), 'utf-8');
      await retry(() => topic.publishMessage({ data }), PUBSUB_RETRY_OPTIONS);
    }

    const elapsed = Date.now() - startMs;
    logger.info(`Published ${summaries.length} messages to ${DELIVERY_TOPIC} in ${elapsed}ms`, {
      topic: DELIVERY_TOPIC,
      count: summaries.length,
      elapsedMs: elapsed,
    });
  }

  retrieveSummaryFromQueue(message: { data: string }): WeeklySummary {
    let payload: unknown;
    try {
      const json = Buffer.from(message.data, 'base64').toString('utf-8');
      payload = JSON.parse(json);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to deserialize Pub/Sub message', err);
      throw new AppError(
        `Failed to deserialize Pub/Sub message: ${errorMessage}`,
        'PUBSUB_DESERIALIZE_ERROR',
        400,
      );
    }
    return this.parseWeeklySummary(payload);
  }

  private parseWeeklySummary(payload: unknown): WeeklySummary {
    const raw = payload as WeeklySummaryRaw;

    if (
      typeof raw.ticker !== 'string' ||
      typeof raw.companyName !== 'string' ||
      typeof raw.weekEndDate !== 'string' ||
      typeof raw.messageTitle !== 'string' ||
      typeof raw.messageShortSummary !== 'string'
    ) {
      const err = new AppError(
        'Pub/Sub message missing required fields: ticker, companyName, weekEndDate, messageTitle, messageShortSummary',
        'PUBSUB_INVALID_PAYLOAD',
        400,
      );
      logger.error('Invalid Pub/Sub payload — missing required fields', err);
      throw err;
    }

    return {
      ticker: raw.ticker,
      companyName: raw.companyName,
      weekEndDate: raw.weekEndDate,
      messageTitle: raw.messageTitle,
      messageShortSummary: raw.messageShortSummary,
    };
  }
}
