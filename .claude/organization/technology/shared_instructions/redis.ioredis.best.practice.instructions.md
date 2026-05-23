---
name: redis ioredis best practice
description: Best practices for using Redis with the ioredis client in Node.js TypeScript Cloud Functions — connection management, TLS, atomic claim patterns, TTL, and error handling.
---

# Instructions for Redis / ioredis in Cloud Functions

## 1. Dependency and import

Use the `ioredis` package. Import the default export:
```typescript
import Redis from 'ioredis';
```

## 2. Connection — singleton, cold-start, TLS required

Create ONE Redis client per function instance at module scope (cold-start). Never create a client per request.

```typescript
import Redis from 'ioredis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let redis: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (redis) return redis;

  const smClient = new SecretManagerServiceClient();
  const [urlVersion] = await smClient.accessSecretVersion({
    name: `projects/${config.projectId}/secrets/REDIS_URL/versions/latest`,
  });
  const [caVersion] = await smClient.accessSecretVersion({
    name: `projects/${config.projectId}/secrets/REDIS_CA_CERT/versions/latest`,
  });

  const url = urlVersion.payload!.data!.toString();
  const ca = caVersion.payload!.data!.toString();

  redis = new Redis(url, {
    tls: { ca },
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 0, // disable ioredis built-in retry — use src/core/retry.ts instead
  });

  return redis;
}
```

- Always use `rediss://` scheme (TLS). Plain `redis://` is NOT acceptable.
- Load `REDIS_URL` and `REDIS_CA_CERT` from GCP Secret Manager — never from env vars or hardcode.
- Set `maxRetriesPerRequest: 0` — the project's `src/core/retry.ts` wrapper handles retries.

## 3. Wrap all operations with retry()

Every Redis call must be wrapped with `retry()` from `src/core/retry.ts`:

```typescript
import { retry } from '../../../../core/retry';

const result = await retry(() => client.getdel(key), {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffFactor: 2,
  shouldRetry: (err) => isTransientRedisError(err),
});
```

Transient errors to retry: connection errors, `ECONNRESET`, `ETIMEDOUT`, `LOADING`, `CLUSTERDOWN`.
Permanent errors (do NOT retry): `WRONGTYPE`, `ERR syntax error`, `NOSCRIPT`.

## 4. GETDEL — atomic claim pattern

Use `GETDEL` for atomic read-and-delete deduplication. This guarantees at-most-once delivery even under concurrent invocations:

```typescript
// Claim a single user token atomically
const token = await retry(() => client.getdel(`user:${uid}`), retryOptions);
if (!token) return; // already claimed or never set
```

Never use `GET` followed by `DEL` — this creates a race condition. `GETDEL` is atomic in Redis 6.2+.

## 5. Set operations — SMEMBERS + SADD + EXPIRE

For fan-out patterns (one ticker → multiple users):

```typescript
// Write: store user UIDs in a set keyed by ticker, with 24h TTL
await retry(() => client.sadd(`ticker:${ticker}`, ...uids), retryOptions);
await retry(() => client.expire(`ticker:${ticker}`, 86400), retryOptions); // 24h

// Read: get all members and delete atomically
const members = await retry(() => client.smembers(`ticker:${ticker}`), retryOptions);
await retry(() => client.del(`ticker:${ticker}`), retryOptions);
```

Use `SMEMBERS` + `DEL` (not `GETDEL` — that's for string keys). The delete should immediately follow the read within the same invocation.

## 6. TTL management

Every key written to Redis must have an explicit TTL:
- User claim keys: 24 hours (`86400` seconds)
- Ticker set keys: 24 hours (`86400` seconds)
- Always call `EXPIRE` immediately after `SADD` / `SET`
- Verify TTL was set: `TTL key` should return a positive number, not -1

## 7. Logging

Log all Redis errors with full context using `src/core/logger.ts`:

```typescript
import { logger } from '../../../../core/logger';

try {
  await retry(() => client.getdel(key), retryOptions);
} catch (err) {
  logger.error('Redis GETDEL failed', { key, error: (err as Error).message });
  throw err;
}
```

Log at `warn` for recoverable issues (empty result, key not found). Log at `error` for failures after all retries exhausted.

## 8. Graceful handling in Cloud Functions

Cloud Functions instances are short-lived. Do NOT explicitly close the Redis connection at the end of a function invocation — closing and reopening on every invocation destroys the performance benefit of cold-start caching. Let the instance lifecycle handle it.

## 9. Key naming conventions

Use colon-separated namespacing:
- Single value: `user:{uid}` → stores FCM token string
- Set: `ticker:{ticker}` → stores set of UIDs
- Namespace keys so they don't collide across features

## 10. Anti-patterns to avoid

- Never create a new `Redis` client per function invocation
- Never use `GET` + `DEL` instead of `GETDEL`
- Never use blocking commands (`BLPOP`, `BRPOP`) in Cloud Functions
- Never store large payloads in Redis — store only identifiers and tokens
- Never bypass `src/core/retry.ts` — do not rely on ioredis built-in retry

---

## Checklist

- [ ] Single Redis client created at module scope (cold-start), not per request
- [ ] `rediss://` scheme used (TLS enforced)
- [ ] `REDIS_URL` and `REDIS_CA_CERT` loaded from GCP Secret Manager
- [ ] `maxRetriesPerRequest: 0` set on ioredis client
- [ ] All Redis operations wrapped with `retry()` from `src/core/retry.ts`
- [ ] `GETDEL` used for atomic claim (not `GET` + `DEL`)
- [ ] Every key written has an explicit TTL via `EXPIRE`
- [ ] Errors logged with key and operation context via `src/core/logger.ts`
