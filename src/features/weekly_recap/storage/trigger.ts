import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { defineSecret } from 'firebase-functions/params';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { Logger } from '../../../core/logger';
import { FirestoreService } from './services/firestore_service';
import { FmpService } from './services/fmp_service';
import { AiService } from './services/ai_service';
import { EvaluationService } from './services/evaluation_service';
import { PubSubService } from './services/pubsub_service';
import type { Company } from './models';
import { TOPIC_NAME } from './constants';
import { buildGraph, runScheduler } from './usecase';

const WEEKLY_RECAP_SCHEDULE = '0 16 * * 5'; // Every Friday at 4 PM ET

const confidentApiKey = defineSecret('CONFIDENT_API_KEY');
const langsmithApiKey = defineSecret('LANGSMITH_API_KEY');
const langsmithProject = defineSecret('LANGSMITH_PROJECT');
const langsmithEndpoint = defineSecret('LANGSMITH_ENDPOINT');

const logger = new Logger('WeeklyRecap/Storage/Trigger');
const firestoreService = new FirestoreService();
const fmpService = new FmpService();
const evaluationService = new EvaluationService();
const aiService = new AiService(evaluationService);
const pubSubService = new PubSubService();

const graph = buildGraph(fmpService, aiService, firestoreService);

export const weeklyRecapScheduler = onSchedule(
  {
    schedule: WEEKLY_RECAP_SCHEDULE,
    timeZone: 'America/New_York',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    logger.info('Scheduler started');

    let companiesCount: number;
    let published: number;
    try {
      ({ companiesCount, published } = await runScheduler(firestoreService, pubSubService));
    } catch (err) {
      logger.error('Scheduler failed — aborting', { err });
      throw err;
    }

    if (companiesCount === 0) {
      logger.warn('Watchlist is empty — nothing to process');
      return;
    }

    logger.info(`Queued ${published}/${companiesCount} Pub/Sub messages`);
  },
);

export const weeklyRecapProcessor = onMessagePublished(
  {
    topic: TOPIC_NAME,
    region: 'us-central1',
    retry: true,
    memory: '512MiB',
    timeoutSeconds: 300,
    secrets: [confidentApiKey, langsmithApiKey, langsmithProject, langsmithEndpoint],
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

    await evaluationService.init();

    try {
      await graph.invoke({ ticker, companyName });
      logger.info(`Completed ${ticker} (${companyName})`, { messageId });
    } catch (err) {
      logger.error(`Graph execution failed for ${ticker} (${companyName})`, { messageId, err });
      throw err;
    } finally {
      await awaitAllCallbacks();
    }
  },
);
