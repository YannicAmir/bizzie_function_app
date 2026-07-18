# firestore_service.ts

Owns every Firestore read/write of this pipeline except the watchlist read, which reuses the core `FirebaseWatchlistService` (`src/core/services/watchlist_service.ts`) — do not duplicate it here.

Imports: `getFirebaseAdmin` from `src/core/firebase`, `Logger` from `src/core/logger`, `crypto` (Node built-in) for the sha256 doc ID (same pattern as `src/core/services/filing_history_service.ts`).

[← back to overview](overview.md)

---

## Collections

| Collection | Access | Notes |
|---|---|---|
| `stock_news/{newsId}` | write (create-only) | TTL on `expireAt`; see [data-models.md](data-models.md) |
| `stock_news_notifier_state/ingestion` | read/write (transactional) | Singleton cursor + lease doc |
| `stock_news_cooldowns/{ticker}` | read/write (transactional) | Per-ticker notification rate limit |

---

## Functions

### `acquireLease(): Promise<boolean>`
Transaction on `stock_news_notifier_state/ingestion`. Returns `false` if `leaseExpiresAt > now` (run already active). Otherwise sets `leaseExpiresAt = now + 90s` (merge) and returns `true`. Throws on transaction failure — caller logs and exits.

### `releaseLease(): Promise<void>`
Sets `leaseExpiresAt = now` (merge). Errors are logged, never thrown — lease expiry is the safety net.

### `getCursor(): Promise<string | null>`
Reads the singleton doc; returns `lastPublishedDate` or `null` when the doc does not exist (first run — caller bootstraps the watermark).

### `advanceCursor(candidate: string): Promise<void>`
Transaction: writes `lastPublishedDate = max(current, candidate)` (string comparison) plus `updatedAt = serverTimestamp()`. The `max` makes the cursor monotonic under any interleaving. Throws on failure — caller logs; an un-advanced cursor only causes idempotent re-reads next run, never a gap.

### `createNewsIfAbsent(article: StockNewsArticle): Promise<boolean>`
Computes `newsId = sha256("{symbol}|{url}")`, then `docRef.create({ ...article, newsId, publishedAt, createdAt: serverTimestamp, expireAt: Timestamp.fromMillis(Date.now() + 72h) })` — where `publishedAt` is `article.publishedDate` parsed as `America/New_York` into a `Timestamp` (the field the front end sorts and filters on; see [data-models.md](data-models.md)).
- Returns `true` — document created; article is new and eligible for notification.
- Returns `false` — Firestore error code `already-exists` (gRPC code 6); duplicate from the overlap window, skipped silently at debug level.
- Any other error: logged at error with `newsId` and `symbol`, then re-thrown so the use case can withhold the cursor advance for this run.

### `claimNotificationSlot(ticker: string, cooldownSeconds: number): Promise<boolean>`
Transaction on `stock_news_cooldowns/{ticker}`: if the doc is missing or `lastNotifiedAt + cooldownSeconds ≤ now`, set `lastNotifiedAt = now` and return `true`; otherwise return `false`. The claim and the authorization are one atomic step — two concurrent runs can never both send for the same ticker inside one cooldown window. Errors are logged and return `false` (fail closed: prefer a missed notification over a duplicate).
