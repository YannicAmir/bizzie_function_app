import Redis from 'ioredis';
import { Logger } from '../../../../core/logger';
import { retry } from '../../../../core/retry';
import type { UserRecord, EligibleUser } from '../models';

const logger = new Logger('WeeklyRecap/Retrieval/RedisService');

const TTL_SECONDS = 86400; // 24 hours

const REDIS_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffFactor: 2,
  shouldRetry: isTransientRedisError,
};

function isTransientRedisError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('LOADING') ||
    message.includes('CLUSTERDOWN') ||
    message.includes('connect ECONNREFUSED')
  );
}

let redisCredentials: { url: string; ca?: string } | null = null;
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisCredentials) throw new Error('RedisService not initialized — call init() first');
  if (redisClient) return redisClient;

  const { url, ca } = redisCredentials;
  redisClient = new Redis(url, {
    ...(ca ? { tls: { ca } } : {}),
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 0,
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
  });

  return redisClient;
}

export class RedisService {
  init(url: string, ca?: string): void {
    redisCredentials = ca ? { url, ca } : { url };
  }

  async storeUsers(users: UserRecord[]): Promise<void> {
    const client = getRedisClient();

    const uniqueTickers = new Set<string>();
    for (const user of users) {
      for (const ticker of user.tickers) {
        uniqueTickers.add(ticker);
      }
    }

    try {
      await retry(async () => {
        const pipeline = client.pipeline();
        for (const user of users) {
          pipeline.set(`user:${user.uid}`, JSON.stringify({ fcmTokens: user.fcmTokens }), 'EX', TTL_SECONDS);
          for (const ticker of user.tickers) {
            pipeline.sadd(`ticker:${ticker}`, user.uid);
          }
        }
        for (const ticker of uniqueTickers) {
          pipeline.expire(`ticker:${ticker}`, TTL_SECONDS);
        }
        const results = await pipeline.exec();
        if (!results) throw new Error('Redis pipeline aborted — connection may have failed');
        const firstError = results.find(([err]) => err != null)?.[0];
        if (firstError) throw firstError;
      }, REDIS_RETRY_OPTIONS);
    } catch (err) {
      logger.error('storeUsers: Redis pipeline failed', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    logger.info(`Stored ${users.length} user keys and ${uniqueTickers.size} ticker sets in Redis`, {
      userCount: users.length,
      tickerCount: uniqueTickers.size,
    });
  }

  async claimUsersForTicker(ticker: string): Promise<EligibleUser[]> {
    const client = getRedisClient();
    const tickerKey = `ticker:${ticker}`;

    let uids: string[];
    try {
      uids = await retry(() => client.smembers(tickerKey), REDIS_RETRY_OPTIONS);
    } catch (err) {
      logger.error('claimUsersForTicker: SMEMBERS failed', { key: tickerKey, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    try {
      await retry(() => client.del(tickerKey), REDIS_RETRY_OPTIONS);
    } catch (err) {
      logger.warn('claimUsersForTicker: DEL ticker key failed — key will expire by TTL', { key: tickerKey, error: err instanceof Error ? err.message : String(err) });
    }

    const total = uids.length;
    const claimed = (await Promise.all(uids.map((uid) => this.claimUser(client, uid)))).filter(
      (u): u is EligibleUser => u !== null,
    );

    const skipped = total - claimed.length;
    logger.info(`Claimed ${claimed.length}/${total} users for ${ticker} (${skipped} already notified)`, {
      ticker,
      claimed: claimed.length,
      total,
      skipped,
    });

    return claimed;
  }

  private async claimUser(client: Redis, uid: string): Promise<EligibleUser | null> {
    const userKey = `user:${uid}`;
    let raw: string | null;
    try {
      raw = await retry(() => client.getdel(userKey), REDIS_RETRY_OPTIONS);
    } catch (err) {
      logger.error('claimUsersForTicker: GETDEL failed', { key: userKey, error: err instanceof Error ? err.message : String(err) });
      return null;
    }

    if (!raw) return null;

    let parsed: { fcmTokens: string[] };
    try {
      parsed = JSON.parse(raw) as { fcmTokens: string[] };
    } catch {
      logger.error('claimUsersForTicker: Failed to parse user record', { key: userKey });
      return null;
    }

    return { uid, fcmTokens: parsed.fcmTokens };
  }
}
