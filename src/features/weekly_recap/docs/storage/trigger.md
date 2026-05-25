# trigger.ts

Cloud Function entry points. Instantiates service dependencies and delegates to the use case. Contains no business logic.

`FirestoreService`, `FmpService`, `AiService`, `EvaluationService`, and `PubSubService` are instantiated once at module scope — the single composition root for all service singletons. `buildGraph` is called at module scope with the service instances, compiling the LangGraph graph once at cold-start. `TOPIC_NAME` is imported from `constants/index.ts` — no string literals in this file.

`CONFIDENT_API_KEY` and `LANGSMITH_API_KEY` are declared using `defineSecret` from `firebase-functions/params` and bound to `weeklyRecapProcessor` via `secrets: [confidentApiKey, langsmithApiKey]` — Firebase injects them as `process.env` at runtime (locally from `.secret.local`, deployed from GCP Secret Manager). `await evaluationService.init()` is called inside the handler (not at module scope) so the secret is available.

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
1. Calls `runScheduler(firestoreService, pubSubService)` from `usecase.ts` — see [usecase.md](usecase.md) for the orchestration detail. On failure, logs an error and re-throws.

---

## `weeklyRecapProcessor`

| Config | Value |
|---|---|
| Type | `onMessagePublished` (Pub/Sub) |
| Topic | `weekly-recap` |
| Region | `us-central1` |
| Memory | `512MiB` |
| Timeout | `300s` |
| Secrets | `CONFIDENT_API_KEY`, `LANGSMITH_API_KEY` (via `defineSecret`) |

**Steps:**
1. Reads `event.data.message.messageId` and includes it in all log entries for this invocation so scheduler → processor failures can be correlated.
2. Calls `PubSubService.retrieveCompanyFromQueue(message)` to decode the Pub/Sub message into a `Company` object. On failure, logs the raw base64 payload and `messageId`, then returns — acknowledging the message without retry (deserialization errors are unrecoverable).
3. Calls `graph.invoke({ ticker, companyName })`. The graph is compiled once at cold-start in `usecase.ts` and derives the week window internally as its first node.
4. On graph execution error: logs and re-throws — this nacks the message and allows Pub/Sub to retry up to 5 times before routing it to the dead-letter topic configured on `weekly-recap` in the GCP console.
