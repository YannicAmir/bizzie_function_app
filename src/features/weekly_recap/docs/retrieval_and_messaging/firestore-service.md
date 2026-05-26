# retrieval_and_messaging/services/firestore_service.ts

All Firestore reads for the retrieval & message pipeline. No writes — this pipeline is read-only from Firestore's perspective.

Uses `getFirebaseAdmin().firestore()` from `src/core/firebase.ts`. Logger instantiated as `new Logger('WeeklyRecap/Retrieval/FirestoreService')` from `src/core/logger.ts`.

---

## Collections

| Collection | Access | Description |
|---|---|---|
| `users/{uid}` | read | User profile — FCM tokens, notification preferences |
| `users/{uid}/watchlist/{ticker}` | read | Per-user ticker subscriptions; document IDs are the ticker symbols |
| `weekly_recap/{ticker}/weeks/{weekEndDate}` | read | LLM summaries written by the storage pipeline |

---

## Functions

### `retrieveEligibleUsers(): Promise<UserRecord[]>`

Called by `weeklyRecapRetrievalScheduler` as the first step.

- Queries the `users` collection server-side with a single filter: `where('notificationsEnabled', '==', true)`. Weekly recap is delivered to all users regardless of subscription status — only users who have explicitly disabled notifications are excluded.
- For each qualifying user, fires all `users/{uid}/watchlist` subcollection reads concurrently using `Promise.allSettled()`. Each document ID in the subcollection is a ticker symbol. Document content is not needed.
- **Failed watchlist reads:** if a subcollection read rejects, logs `warn` with the UID and error, and excludes that user from the result. One failed read does not abort the batch — remaining users proceed normally.
- Converts `UserProfile.fcmTokens` (map of `{ [deviceId]: token }`) to a deduplicated `string[]` of token values — device IDs are not used downstream. Deduplication removes duplicate token values that arise when a device re-registers under a new device ID without the old entry being cleaned up.
- Returns an array of `UserRecord` (`{ uid, fcmTokens, tickers }`) for all users whose watchlist was successfully read.
- Returns an empty array (no throw) if no eligible users exist — usecase logs a warning and exits cleanly.

---

### `retrieveSummariesForWeek(weekEndDate: string): Promise<WeeklySummary[]>`

Called by `weeklyRecapRetrievalScheduler` after `RedisService.storeUsers()` completes.

- `weekEndDate` is the Friday date in `YYYY-MM-DD` format (e.g. `"2026-05-16"`).
- Uses a **Firestore collection group query** on the `weeks` subcollection, filtering by the `time` field:
  - `time >= "${weekEndDate}T00:00:00.000Z"` AND `time < "${nextDay}T00:00:00.000Z"`
  - Returns all `weekly_recap/{ticker}/weeks/{weekEndDate}` documents written on that Friday in a **single round-trip**, regardless of how many tickers exist.
  - This replaces N individual per-ticker reads with one query. The `time` field is stored as an ISO 8601 string by the storage pipeline, so string range comparison is correct.
- Documents missing a `ticker` field are skipped with a `warn` log.
- Maps each result document to `WeeklySummary` (`ticker`, `companyName`, `weekEndDate`, `messageTitle`, `messageShortSummary`).
- Returns the array of `WeeklySummary` for all tickers that have summaries this week.
- Throws on Firestore error (caught and logged by the scheduler).

**Note:** This query requires a composite index on `collectionGroup: weeks` with fields `time ASC`. Firestore will prompt for it on first run with a console link to create it.
