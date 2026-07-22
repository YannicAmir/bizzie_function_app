# firestore_service.ts

Owns every Firestore read/write of this pipeline. Modeled directly on [stock_news_notifier/firestore_service.ts](../../../stock_news_notifier/docs/ingestion_and_messaging/firestore-service.md), with the cooldown functions removed (no notifications) and the watchlist read removed (no ticker filter).

Imports: `getFirebaseAdmin` from `src/core/firebase`, `Logger` from `src/core/logger`, `crypto` (Node built-in) for the sha256 doc ID (same pattern as `src/core/services/filing_history_service.ts`).

[← back to overview](overview.md)

---

## Collections

| Collection | Access | Notes |
|---|---|---|
| `general_market_news/{newsId}` | write (create-only) | TTL on `expireAt`; see [data-models.md](data-models.md) |
| `general_market_news_state/ingestion` | read/write (transactional) | Singleton cursor + lease doc |

---

## Functions

### `acquireLease(runIntervalSeconds: number): Promise<boolean>`
Transaction on `general_market_news_state/ingestion`. Returns `false` if either is true:
- `leaseExpiresAt > now` (run already active), or
- `lastRunAt + runIntervalSeconds > now` (poll interval hasn't elapsed yet — the Remote Config-driven cadence gate; see [tech-stack.md](tech-stack.md#remote-config)).

Otherwise sets `leaseExpiresAt = now + 90s` and `lastRunAt = now` (merge) and returns `true`. Throws on transaction failure — caller logs and exits.

### `releaseLease(): Promise<void>`
Sets `leaseExpiresAt = now` (merge). Errors are logged, never thrown — lease expiry is the safety net.

### `getCursor(): Promise<string | null>`
Reads the singleton doc; returns `lastPublishedDate` or `null` when the doc does not exist (first run — caller bootstraps the watermark).

### `advanceCursor(candidate: string): Promise<void>`
Transaction: writes `lastPublishedDate = max(current, candidate)` (string comparison) plus `updatedAt = serverTimestamp()`. The `max` makes the cursor monotonic under any interleaving. Throws on failure — caller logs; an un-advanced cursor only causes idempotent re-reads next run, never a gap.

### `createNewsIfAbsent(article: GeneralNewsArticle): Promise<boolean>`
Computes `newsId = sha256(url)`, then `docRef.create({ ...article, newsId, publishedAt, createdAt: serverTimestamp, expireAt: Timestamp.fromMillis(Date.now() + 48h) })` — where `publishedAt` is `article.publishedDate` parsed as `America/New_York` into a `Timestamp` (the field the front end sorts on; see [data-models.md](data-models.md)).
- Returns `true` — document created; article is new.
- Returns `false` — Firestore error code `already-exists` (gRPC code 6); duplicate from the overlap window, skipped silently at debug level.
- Any other error: logged at error with `newsId`, then re-thrown so the use case can withhold the cursor advance for this run.
