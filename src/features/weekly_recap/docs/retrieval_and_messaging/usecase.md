# retrieval_and_messaging/usecase.ts

Orchestration layer for the retrieval & message pipeline. Contains all business logic — no Cloud Function trigger imports.

---

## `RetrievalSchedulerUsecase`

### `execute(): Promise<void>`

Called by `weeklyRecapRetrievalScheduler`. Steps are sequential — order is mandatory.

1. Calls `FirestoreService.retrieveSubscribedUsers()` to query eligible users server-side (`isSubscribed: true` AND `notificationsEnabled: true`) and concurrently fetch each user's watchlist via `Promise.allSettled()`. Users whose watchlist read fails are excluded with a `warn` log — one failure does not abort the batch.
2. Calls `RedisService.storeUsers(users)` to write `user:{uid}` keys and `ticker:{ticker}` sets to Redis. **Must complete before step 3** — processors must not start running until Redis is fully populated.
3. Calls `FirestoreService.retrieveSummariesForWeek(weekEndDate)` — a single Firestore collection group query on `weeks` filtered by the `time` field returns all summaries written this week across all tickers in one round-trip. No ticker list is needed as input. Documents missing a `ticker` field are skipped with a `warn` log.
4. Calls `PubSubService.queueSummaries(summaries)` to publish one Pub/Sub message per ticker to `weekly-recap-delivery`. Each message payload is the full `WeeklySummary` (`ticker`, `companyName`, `weekEndDate`, `messageTitle`, `messageShortSummary`).

**On-error:** If no subscribed users are found after step 1, logs `warn` and exits cleanly — no Redis writes, no Pub/Sub messages.

---

## `DeliveryProcessorUsecase`

### `execute(message: WeeklySummary): Promise<void>`

Called by `weeklyRecapDeliveryProcessor`. Steps:

1. Calls `RedisService.claimUsersForTicker(ticker)` — `SMEMBERS ticker:{ticker}` then `GETDEL user:{uid}` per UID. `GETDEL` atomically retrieves the user's FCM tokens and deletes the key in a single operation. Returns only users whose `GETDEL` returned a value (non-null). If a prior ticker's processor already ran `GETDEL` for a given UID, that key no longer exists — this call returns `null` and the user is skipped.
2. If no eligible users remain after claiming: logs `info` and returns — message is acknowledged, nothing to send.
3. Calls `FcmService.sendNotifications(users, summary)` to send FCM push notifications in batches of 500 tokens via `sendEachForMulticast`. Each batch call is wrapped in `retry()` from `src/core/retry.ts` for transient failures. Stale tokens (`UNREGISTERED`) and other per-token errors are permanent failures handled within the batch response — not retried.

**On-error:** Never re-throws — any uncaught error is logged at `error` and swallowed so the Pub/Sub message is always acknowledged.
