import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { defineSecret } from 'firebase-functions/params';
import { Logger } from '../../../core/logger';
import { config } from '../../../core/config';
import { FirestoreService } from './services/firestore_service';
import { RedisService } from './services/redis_service';
import { PubSubService } from './services/pubsub_service';
import { FcmService } from './services/fcm_service';
import { RetrievalSchedulerUsecase, DeliveryProcessorUsecase } from './usecase';
import type { WeeklySummary } from './models';
import { DELIVERY_TOPIC } from './constants/pubsub';

const redisUrl = defineSecret('REDIS_URL');
// redisCA is only mounted on prod — dev/qa Redis does not use TLS
const redisCA = defineSecret('REDIS_CA_CERT');

const isProd = process.env.ENV === 'prod';
const functionSecrets = isProd ? [redisUrl, redisCA] : [redisUrl];

function initRedis(): void {
  redisService.init(redisUrl.value(), isProd ? redisCA.value() || undefined : undefined);
}

const RETRIEVAL_SCHEDULE = '50 16 * * 5'; // Every Friday at 4:50 PM ET
const TIMEZONE = 'America/New_York';

const logger = new Logger('WeeklyRecap/Retrieval/Trigger');

const firestoreService = new FirestoreService();
const redisService = new RedisService();
const pubSubService = new PubSubService();
const fcmService = new FcmService();

const retrievalSchedulerUsecase = new RetrievalSchedulerUsecase(
  firestoreService,
  redisService,
  pubSubService,
);

const deliveryProcessorUsecase = new DeliveryProcessorUsecase(
  redisService,
  fcmService,
);

export const weeklyRecapRetrievalScheduler = onSchedule(
  {
    schedule: RETRIEVAL_SCHEDULE,
    timeZone: TIMEZONE,
    region: config.location,
    memory: '512MiB',
    timeoutSeconds: 300,
    secrets: functionSecrets,
  },
  async () => {
    initRedis();
    logger.info('Retrieval scheduler started');

    try {
      await retrievalSchedulerUsecase.execute();
    } catch (err) {
      logger.error('Retrieval scheduler failed', err);
    }
  },
);

export const weeklyRecapDeliveryProcessor = onMessagePublished(
  {
    topic: DELIVERY_TOPIC,
    region: config.location,
    memory: '256MiB',
    timeoutSeconds: 60,
    retry: true,
    secrets: functionSecrets,
  },
  async (event) => {
    initRedis();
    const message = event.data.message;

    let summary: WeeklySummary;
    try {
      summary = pubSubService.retrieveSummaryFromQueue(message);
    } catch (err) {
      logger.error('Delivery failed — malformed Pub/Sub payload, message acknowledged', {
        rawData: message.data,
        error: err,
      });
      return;
    }

    logger.info(`Processing delivery for ${summary.ticker} (${summary.companyName})`, {
      ticker: summary.ticker,
      companyName: summary.companyName,
      messageId: event.data.message.messageId,
    });

    try {
      await deliveryProcessorUsecase.execute(summary);
    } catch (err) {
      logger.error(`Delivery failed for ${summary.ticker} — message acknowledged`, err);
    }
  },
);
