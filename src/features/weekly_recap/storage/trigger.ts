import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { defineSecret } from 'firebase-functions/params';
import { Logger } from '../../../core/logger';
import { retry } from '../../../core/retry';
import { FirestoreService } from './services/firestore_service';
import { FmpService } from './services/fmp_service';
import { AiService } from './services/ai_service';
import { EvaluationService } from './services/evaluation_service';
import { PubSubService } from './services/pubsub_service';
import type { Company } from './models';
import { TOPIC_NAME } from './constants';
import { buildGraph } from './usecase';

const confidentApiKey = defineSecret('CONFIDENT_API_KEY');
const confidentProjectName = defineSecret('CONFIDENT_PROJECT_NAME');

const logger = new Logger('WeeklyRecap/Storage/Trigger');
const firestoreService = new FirestoreService();
const fmpService = new FmpService();
const evaluationService = new EvaluationService();
const aiService = new AiService(evaluationService);
const pubSubService = new PubSubService();

void evaluationService.init();

const graph = buildGraph(fmpService, aiService, firestoreService);

export const weeklyRecapScheduler = onSchedule(
  {
    schedule: '0 16 * * 5',
    timeZone: 'America/New_York',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    logger.info('Scheduler started');

    let companies: Company[];
    try {
      companies = await retry(() => firestoreService.retrieveCompaniesFromDb(), {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
      });
    } catch (err) {
      logger.error('Watchlist fetch exhausted retries — aborting', { err });
      throw err;
    }

    logger.info(`Loaded ${companies.length} companies from watchlist`);

    if (companies.length === 0) {
      logger.warn('Watchlist is empty — nothing to process');
      return;
    }

    const startMs = Date.now();
    const published = await pubSubService.queueCompanies(companies);
    const durationMs = Date.now() - startMs;

    logger.info(`Queued ${published}/${companies.length} Pub/Sub messages in ${durationMs}ms`);
  },
);

export const weeklyRecapProcessor = onMessagePublished(
  {
    topic: TOPIC_NAME,
    memory: '512MiB',
    timeoutSeconds: 300,
    secrets: [confidentApiKey, confidentProjectName],
  },
  async (event) => {
    const messageId = event.data.message.messageId;

    let company: Company;
    try {
      company = pubSubService.retrieveCompanyFromQueue(event.data.message);
    } catch (err) {
      logger.error('Failed to deserialize Pub/Sub message — acknowledging without retry', {
        messageId,
        raw: event.data.message.data,
        err,
      });
      return;
    }

    const { ticker, companyName } = company;
    logger.info(`Processing ${ticker} (${companyName})`, { messageId });

    try {
      await graph.invoke({ ticker, companyName });
      logger.info(`Completed ${ticker} (${companyName})`, { messageId });
    } catch (err) {
      logger.error(`Graph execution failed for ${ticker} (${companyName})`, { messageId, err });
      throw err;
    }
  },
);
