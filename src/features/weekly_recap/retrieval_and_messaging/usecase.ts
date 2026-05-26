import { Logger } from '../../../core/logger';
import { FirestoreService } from './services/firestore_service';
import { RedisService } from './services/redis_service';
import { PubSubService } from './services/pubsub_service';
import { FcmService } from './services/fcm_service';
import type { WeeklySummary } from './models';

const logger = new Logger('WeeklyRecap/Retrieval/Usecase');

function getTodayUTC(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class RetrievalSchedulerUsecase {
  constructor(
    private readonly firestoreService: FirestoreService,
    private readonly redisService: RedisService,
    private readonly pubSubService: PubSubService,
  ) {}

  async execute(): Promise<void> {
    const users = await this.firestoreService.retrieveEligibleUsers();

    if (users.length === 0) {
      logger.warn('No users with notifications enabled — nothing to deliver');
      return;
    }

    const uniqueTickerCount = new Set(users.flatMap((u) => u.tickers)).size;
    logger.info(`Loaded ${users.length} users with ${uniqueTickerCount} unique tickers`, {
      userCount: users.length,
      tickerCount: uniqueTickerCount,
    });

    await this.redisService.storeUsers(users);

    logger.info(`Stored ${users.length} users and ${uniqueTickerCount} ticker sets in Redis`, {
      userCount: users.length,
      tickerCount: uniqueTickerCount,
    });

    const weekEndDate = getTodayUTC();
    const summaries = await this.firestoreService.retrieveSummariesForWeek(weekEndDate);

    await this.queueSummariesWithLogging(summaries);
  }

  private async queueSummariesWithLogging(summaries: WeeklySummary[]): Promise<void> {
    const startMs = Date.now();
    await this.pubSubService.queueSummaries(summaries);
    const elapsed = Date.now() - startMs;

    logger.info(`Queued ${summaries.length} Pub/Sub messages in ${elapsed}ms`, {
      count: summaries.length,
      elapsedMs: elapsed,
    });
  }
}

export class DeliveryProcessorUsecase {
  constructor(
    private readonly redisService: RedisService,
    private readonly fcmService: FcmService,
  ) {}

  async execute(message: WeeklySummary): Promise<void> {
    try {
      const users = await this.redisService.claimUsersForTicker(message.ticker);

      if (users.length === 0) {
        logger.info(
          `No eligible users for ${message.ticker} — all already notified or none subscribed`,
          { ticker: message.ticker },
        );
        return;
      }

      await this.fcmService.sendNotifications(users, message);

      const totalTokens = users.reduce((sum, u) => sum + u.fcmTokens.length, 0);
      logger.info(`Delivery complete for ${message.ticker}: ${totalTokens} tokens notified`, {
        ticker: message.ticker,
        tokensNotified: totalTokens,
      });
    } catch (err) {
      logger.error(`Delivery failed for ${message.ticker} — message acknowledged`, err);
    }
  }
}
