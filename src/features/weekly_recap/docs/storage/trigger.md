# trigger.ts

Cloud Function entry points. Instantiates service dependencies and delegates to the use case. Contains no business logic.

`FirestoreService`, `FmpService`, `AiService`, `EvaluationService`, and `PubSubService` are instantiated once at module scope — the single composition root for all service singletons. `void evaluationService.init()` is called at module scope for cold-start DeepEval setup. `buildGraph` is called at module scope with the service instances, compiling the LangGraph graph once at cold-start. `TOPIC_NAME` is imported from `constants/index.ts` — no string literals in this file. `CONFIDENT_API_KEY` is declared using `defineSecret('CONFIDENT_API_KEY')` from `firebase-functions/params` and bound to `weeklyRecapProcessor` via `secrets: [confidentApiKey]` — Firebase injects it as `process.env.CONFIDENT_API_KEY` at runtime (locally from `.secret.local`, deployed from GCP Secret Manager).

---

## `weeklyRecapScheduler`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `0 16 * * 5` (every Friday, 4pm EST) |
| Timezone | `America/New_York` |
| Memory | `256MiB` |
| Timeout | `60s` |

**Steps:**
1. Calls `FirestoreService.retrieveCompaniesFromDb()` via `retry()` (`src/core/retry.ts`) — 3 attempts, 1s initial delay, backoff factor 2 (1s → 2s → throw). Per-attempt warn logs are emitted by the retry utility. On final failure, logs an error and re-throws.
2. Calls `PubSubService.queueCompanies(companies)` once with the full array, which publishes one message per `Company` to the `weekly-recap` topic. Each message payload is `{ ticker: string, companyName: string }`. No dates are included — the week window is calculated by the processor at execution time.

---

## `weeklyRecapProcessor`

| Config | Value |
|---|---|
| Type | `onMessagePublished` (Pub/Sub) |
| Topic | `weekly-recap` |
| Memory | `512MiB` |
| Timeout | `300s` |
| Secrets | `CONFIDENT_API_KEY` (via `defineSecret`) |

**Steps:**
1. Reads `event.data.message.messageId` and includes it in all log entries for this invocation so scheduler → processor failures can be correlated.
2. Calls `PubSubService.retrieveCompanyFromQueue(message)` to decode the Pub/Sub message into a `Company` object. On failure, logs the raw base64 payload and `messageId`, then returns — acknowledging the message without retry (deserialization errors are unrecoverable).
3. Calls `graph.invoke({ ticker, companyName })`. The graph is compiled once at cold-start in `usecase.ts` and derives the week window internally as its first node.
4. On graph execution error: logs and re-throws — this nacks the message and allows Pub/Sub to retry up to 5 times before routing it to the dead-letter topic configured on `weekly-recap` in the GCP console.
