# retrieval_and_messaging/services/firestore_service.ts

All Firestore reads for the retrieval & message pipeline. No writes — this pipeline is read-only from Firestore's perspective.

Uses `getFirebaseAdmin().firestore()` from `src/core/firebase.ts`. Logger instantiated as `new Logger('WeeklyRecap/Retrieval/FirestoreService')` from `src/core/logger.ts`.

---

## Collections

| Collection | Access | Description |
|---|---|---|
| `users/{uid}` | read | User profile — FCM tokens, subscription status, notification preferences |
| `users/{uid}/watchlist/{ticker}` | read | Per-user ticker subscriptions; document IDs are the ticker symbols |
| `weekly_recap/{ticker}/weeks/{weekEndDate}` | read | LLM summaries written by the storage pipeline |

---

## Functions

### `retrieveSubscribedUsers(): Promise<UserRecord[]>`

Called by `weeklyRecapRetrievalScheduler` as the first step.

- Queries the `users` collection server-side using a compound filter: `where('isSubscribed', '==', true).where('notificationsEnabled', '==', true)`. Only qualifying documents cross the wire — inactive users are never read. Requires the composite index defined in `firestore.indexes.json` (fields: `isSubscribed ASC`, `notificationsEnabled ASC`).
- For each qualifying user, fires all `users/{uid}/watchlist` subcollection reads concurrently using `Promise.allSettled()`. Each document ID in the subcollection is a ticker symbol. Document content is not needed.
- **Failed watchlist reads:** if a subcollection read rejects, logs `warn` with the UID and error, and excludes that user from the result. One failed read does not abort the batch — remaining users proceed normally.
- Converts `UserProfile.fcmTokens` (map of `{ [deviceId]: token }`) to a plain `string[]` of token values — device IDs are not used downstream.
- Returns an array of `UserRecord` (`{ uid, fcmTokens, tickers }`) for all users whose watchlist was successfully read.
- Returns an empty array (no throw) if no subscribed users exist — usecase logs a warning and exits cleanly.

---

### `retrieveSummariesForWeek(weekEndDate: string): Promise<WeeklySummary[]>`

Called by `weeklyRecapRetrievalScheduler` after `RedisService.storeUsers()` completes.

- `weekEndDate` is the Friday date in `YYYY-MM-DD` format, matching the document ID written by the storage pipeline (e.g. `"2026-05-16"`).
- Derives the set of tickers to query from the `ticker:{ticker}` keys already stored in Redis. This avoids a redundant Firestore read to enumerate tickers — the user watchlists already define the full ticker set.
- Reads `weekly_recap/{ticker}/weeks/{weekEndDate}` for each ticker individually (Firestore does not support cross-collection queries across the `weekly_recap` top-level).
- For each ticker document that exists: maps to `WeeklySummary` (`ticker`, `companyName`, `weekEndDate`, `messageTitle`, `messageShortSummary`).
- For each ticker document that does not exist: logs `warn` and skips. This means the storage pipeline did not generate a summary for that ticker this week.
- Returns the array of `WeeklySummary` for tickers that have summaries.
- Throws on Firestore error (caught and logged by the scheduler).
