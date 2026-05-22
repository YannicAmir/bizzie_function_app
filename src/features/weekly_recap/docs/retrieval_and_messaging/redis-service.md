# retrieval_and_messaging/services/redis_service.ts

All Redis reads and writes for the retrieval & message pipeline. Acts as the ephemeral claim store that enforces the one-notification-per-user-per-week deduplication guarantee.

Uses the `ioredis` client (`REDIS_URL` from GCP Secret Manager). Logger instantiated as `new Logger('WeeklyRecap/Retrieval/RedisService')` from `src/core/logger.ts`.

---

## Key Schema

| Key | Type | Value | TTL |
|---|---|---|---|
| `user:{uid}` | String (JSON) | `{ fcmTokens: string[] }` | 24 hours |
| `ticker:{ticker}` | Set | UIDs subscribed to this ticker | 24 hours |

TTL is set to 24 hours on every key at write time. Stale keys are cleaned up automatically — even if the delivery window fails partway, keys will not persist into the following week.

---

## Connection

Redis connection is initialized once per cold-start and cached for the lifetime of the function instance:

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
```

`REDIS_URL` is fetched from GCP Secret Manager at cold-start following the mandatory secret pattern — identical secret name across dev, qa, and prod; GCP project context resolves the correct value.

---

## Functions

### `storeUsers(users: UserRecord[]): Promise<void>`

Called by `weeklyRecapRetrievalScheduler` after `retrieveSubscribedUsers()`. **Must complete before `queueSummaries()` is called** — processors must not start until Redis is fully populated.

- Uses a single Redis pipeline (batched commands) to minimise round-trips.
- For each `UserRecord`:
  - `SET user:{uid} <JSON> EX 86400` — stores FCM tokens with 48-hour TTL.
  - For each ticker in `UserRecord.tickers`: `SADD ticker:{ticker} {uid}` — adds the UID to the ticker's subscriber set.
- After all `SADD` commands: sets TTL on each `ticker:{ticker}` key with `EXPIRE ticker:{ticker} 86400`.
- Logs the total number of users and unique tickers stored on completion.
- Throws on Redis error (caught and logged by the scheduler).

---

### `claimUsersForTicker(ticker: string): Promise<EligibleUser[]>`

Called by `weeklyRecapDeliveryProcessor` as the second step. Implements the deduplication pattern.

- `SMEMBERS ticker:{ticker}` — retrieves the full set of UIDs subscribed to this ticker.
- For each UID: `GETDEL user:{uid}` — atomically retrieves the user's FCM tokens and **deletes the key in a single operation**.
  - If `GETDEL` returns a value: the user has not yet been notified — include in the result set.
  - If `GETDEL` returns `null`: the user was already claimed by an earlier ticker's processor — skip.
- `GETDEL` is the atomic guarantee: no race condition between two concurrent processors claiming the same user.
- Returns `EligibleUser[]` — only users successfully claimed in this invocation.
- Returns an empty array (no throw) if the ticker set is empty or all users were already claimed.
- Throws on Redis error (caught and logged by the processor).

**Why `GETDEL` enforces deduplication:** When ticker AAPL is processed, `GETDEL user:uid1` succeeds and uid1's key is deleted. When ticker GOOGL is processed concurrently, `GETDEL user:uid1` returns `null` — uid1 is skipped. uid1 receives exactly one notification regardless of how many tickers they follow.
