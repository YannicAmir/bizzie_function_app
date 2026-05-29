import { PubSub } from '@google-cloud/pubsub';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import { AppError } from '../../../../core/errors';
import type { Company } from '../models';
import { TOPIC_NAME } from '../constants';

const logger = new Logger('WeeklyRecap/Storage/PubSubService');

const pubsub = new PubSub();

type CompanyMessageRaw = Readonly<{
  ticker?: unknown;
  companyName?: unknown;
}>;

const TRANSIENT_GRPC_CODES: number[] = [
  4,  // DEADLINE_EXCEEDED
  8,  // RESOURCE_EXHAUSTED
  13, // INTERNAL
  14, // UNAVAILABLE
];

function isTransientPubSubError(err: unknown): boolean {
  const grpcCode = (err as { code?: number })?.code;
  return TRANSIENT_GRPC_CODES.includes(grpcCode ?? -1);
}

const PUBSUB_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: isTransientPubSubError,
};

export class PubSubService {
  async queueCompanies(companies: Company[]): Promise<number> {
    const topic = pubsub.topic(TOPIC_NAME);
    let published = 0;

    for (const company of companies) {
      try {
        const data = Buffer.from(JSON.stringify(company), 'utf-8');
        await retry(() => topic.publishMessage({ data }), PUBSUB_RETRY_OPTIONS);
        published++;
      } catch (err) {
        logger.error(`Failed to queue ${company.ticker} (${company.companyName}) — skipping`, err);
      }
    }

    logger.info(`Published ${published}/${companies.length} Pub/Sub messages`, { topic: TOPIC_NAME, published, total: companies.length });
    return published;
  }

  retrieveCompanyFromQueue(message: { data: string }): Company {
    let payload: unknown;
    try {
      const json = Buffer.from(message.data, 'base64').toString('utf-8');
      payload = JSON.parse(json);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new AppError(
        `Failed to deserialize Pub/Sub message: ${errorMessage}`,
        'PUBSUB_DESERIALIZE_ERROR',
        400,
      );
    }

    const raw = payload as CompanyMessageRaw;
    if (typeof raw.ticker !== 'string' || typeof raw.companyName !== 'string') {
      throw new AppError(
        'Pub/Sub message missing required fields: ticker, companyName',
        'PUBSUB_INVALID_PAYLOAD',
        400,
      );
    }

    return {
      ticker: raw.ticker,
      companyName: raw.companyName,
    };
  }
}
