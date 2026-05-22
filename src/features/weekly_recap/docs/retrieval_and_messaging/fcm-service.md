# retrieval_and_messaging/services/fcm_service.ts

Sends Apple Push Notification Service (APNS) notifications via Firebase Cloud Messaging (FCM) to all eligible users for a given ticker.

Uses `getFirebaseAdmin().messaging()` from `src/core/firebase.ts`. Logger instantiated as `new Logger('WeeklyRecap/Retrieval/FcmService')` from `src/core/logger.ts`.

---

## APNS Payload Schema

| Field | Value | Source |
|---|---|---|
| `notification.title` | `messageTitle` | `WeeklySummary` (≤ 50 chars) |
| `notification.body` | `messageShortSummary` | `WeeklySummary` (≤ 150 chars) |
| `data.type` | `"weekly_summary"` | static |
| `data.ticker` | ticker symbol | `WeeklySummary` |
| `topic` | ticker symbol | `WeeklySummary` — routes to APNS topic in the app |

The `data` block enables deep-link routing in the app when the user taps the notification. The app reads the full summary from Firestore (`weekly_recap/{ticker}/weeks/{weekEndDate}`) on open — the notification carries only enough to render the alert and route correctly.

---

## Functions

### `sendNotifications(users: EligibleUser[], summary: WeeklySummary): Promise<void>`

Called by `weeklyRecapDeliveryProcessor` after `RedisService.claimUsersForTicker()`.

- Builds one `FcmPayload` from the `WeeklySummary`.
- Collects all FCM tokens across all eligible users into a flat array, preserving a mapping from each array index back to the originating `EligibleUser` (uid and token).
- Chunks the token array into batches of 500 and calls `admin.messaging().sendEachForMulticast(multicastMessage)` per batch, wrapped in `retry()` from `src/core/retry.ts` (`maxAttempts: 2, initialDelayMs: 1000ms, backoffFactor: 2`).
- **Retry scope:** `retry()` wraps the entire batch call — it handles transient failures where the call itself throws (`UNAVAILABLE`, `DEADLINE_EXCEEDED`, HTTP 429/500/503, network errors). If all retry attempts are exhausted, the error is logged at `error` and that batch is skipped — remaining batches still execute.
- **Batch response handling:** for each batch, iterates over the `BatchResponse.responses` array. Each `SendResponse` is matched back to its token via its array index. A user with multiple devices receives the notification on each device.
- **Stale token handling:** if a `SendResponse` contains error code `messaging/registration-token-not-registered` (`UNREGISTERED`): logs `warn` with the UID and token (truncated). Does not throw and does not remove the token from Firestore — token cleanup is out of scope for this pipeline. Not retried — permanent failure.
- **Other FCM errors:** if a `SendResponse` contains any other error: logs `error` with the UID, token (truncated), and error code. Does not throw — delivery failure for one token must not abort delivery to other users. Not retried — per-token `SendResponse` errors are permanent failures within an otherwise successful batch call.
- Logs total tokens attempted, succeeded, and failed on completion.
- Never throws — any uncaught error is logged at `error` and swallowed. The processor must not re-throw so the Pub/Sub message is acknowledged.
