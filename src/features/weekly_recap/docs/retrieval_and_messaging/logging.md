# Logging Spec

All logging uses `Logger` from `src/core/logger.ts`. Each file instantiates its own logger with a descriptive context name so every log line is identifiable in Cloud Logging.

```typescript
const logger = new Logger('WeeklyRecap/Retrieval/FcmService');   // example
```

Each file uses `new Logger(context)` from `src/core/logger.ts`. Context naming convention: `WeeklyRecap/Retrieval/{FileName}`.

**Every log line includes the logger context as the `service` field**, so you always know which file emitted it — no need to manually include the service name inside the message string.

---

## `retrieval_and_messaging/trigger.ts` — `WeeklyRecap/Retrieval/Trigger`

| Event | Level | Message |
|---|---|---|
| Scheduler started | `info` | `"Retrieval scheduler started"` |
| Processor message received | `info` | `"Processing delivery for {ticker} ({companyName})"` |
| Processor unrecoverable error | `error` | `"Delivery failed for {ticker} — message acknowledged"` + error |
| Malformed Pub/Sub payload | `error` | `"Delivery failed — malformed Pub/Sub payload, message acknowledged"` + `rawData` + error |

---

## `retrieval_and_messaging/usecase.ts` — `WeeklyRecap/Retrieval/Usecase`

| Event | Level | Message |
|---|---|---|
| Users loaded | `info` | `"Loaded {n} users with {t} unique tickers"` |
| No eligible users | `warn` | `"No users with notifications enabled — nothing to deliver"` |
| Users stored in Redis | `info` | `"Stored {n} users and {t} ticker sets in Redis"` |
| Summaries queued | `info` | `"Queued {n} Pub/Sub messages in {ms}ms"` |
| No eligible users for ticker | `info` | `"No eligible users for {ticker} — all already notified or none subscribed"` |
| Processor completed | `info` | `"Delivery complete for {ticker}: {sent} tokens notified"` |

---

## `retrieval_and_messaging/services/firestore_service.ts` — `WeeklyRecap/Retrieval/FirestoreService`

| Event | Level | Message |
|---|---|---|
| Users fetched | `info` | `"Fetched {n} users from Firestore ({eligible} eligible)"` |
| Watchlist fetch per user | `debug` | `"Fetched {n} tickers for user {uid}"` |
| Watchlist read failed | `warn` | `"Watchlist read failed for uid {uid} — user excluded from delivery"` + error |
| Summary fetched for ticker | `debug` | `"Found summary for {ticker} / {weekEndDate}"` |
| Summary missing for ticker | `warn` | `"No summary document for {ticker} / {weekEndDate}"` |
| Any Firestore error | `error` | Operation name + identifier + error |

---

## `retrieval_and_messaging/services/redis_service.ts` — `WeeklyRecap/Retrieval/RedisService`

| Event | Level | Message |
|---|---|---|
| Users stored | `info` | `"Stored {n} user keys and {t} ticker sets in Redis"` |
| Claim result for ticker | `info` | `"Claimed {n}/{total} users for {ticker} ({skipped} already notified)"` |
| Redis error | `error` | Operation name + key + error |

---

## `retrieval_and_messaging/services/pubsub_service.ts` — `WeeklyRecap/Retrieval/PubSubService`

| Event | Level | Message |
|---|---|---|
| Messages published | `info` | `"Published {n} messages to weekly-recap-delivery in {ms}ms"` |
| Invalid message payload | `error` | `"Invalid Pub/Sub payload — missing required fields"` + error |
| Pub/Sub client error | `error` | Operation name + error |

---

## `retrieval_and_messaging/services/fcm_service.ts` — `WeeklyRecap/Retrieval/FcmService`

| Event | Level | Message |
|---|---|---|
| Notifications sent | `info` | `"Sent {succeeded}/{attempted} FCM tokens for {ticker}"` |
| Stale token | `warn` | `"Stale FCM token for uid {uid} — UNREGISTERED"` |
| FCM send error | `error` | `"FCM send failed for uid {uid}: {errorCode}"` + error |
