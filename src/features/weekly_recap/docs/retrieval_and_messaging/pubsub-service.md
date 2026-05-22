# retrieval_and_messaging/services/pubsub_service.ts

Handles all Pub/Sub interactions for the retrieval & message pipeline: publishing per-ticker summary messages from the scheduler and deserializing them in the processor. No business logic — pure message transport.

Uses the `@google-cloud/pubsub` client. Topic and project resolved from `config.projectId` (`src/core/config.ts`). Logger instantiated as `new Logger('WeeklyRecap/Retrieval/PubSubService')` from `src/core/logger.ts`.

---

## Topic

| Key | Value |
|---|---|
| Topic name | `weekly-recap-delivery` |
| Message payload | `WeeklySummary` — see [data-models.md](data-models.md) |
| Encoding | JSON, base64-encoded by the Pub/Sub SDK |
| Dead-letter topic | `weekly-recap-delivery-dead-letter` — see [../../storage/dead-letter-setup.md](../../storage/dead-letter-setup.md) |

This is a separate topic from the storage pipeline's `weekly-recap` topic.

---

## Functions

### `queueSummaries(summaries: WeeklySummary[]): Promise<void>`

Called by `weeklyRecapRetrievalScheduler` after `RedisService.storeUsers()` completes.

- Iterates over `summaries` and publishes one Pub/Sub message per `WeeklySummary` to the `weekly-recap-delivery` topic.
- Each message payload is `WeeklySummary`: `{ ticker, companyName, weekEndDate, messageTitle, messageShortSummary }` serialised as JSON.
- Pub/Sub retries a failed message up to **5 times** before routing it to the dead-letter topic on `weekly-recap-delivery`.
- Logs the count of messages published on completion.
- Throws if the Pub/Sub client fails (caught and logged by the scheduler).

---

### `retrieveSummaryFromQueue(message): WeeklySummary`

Called by `weeklyRecapDeliveryProcessor` as the first step.

- Decodes the base64 message data and parses the JSON payload.
- Returns the typed `WeeklySummary` object (`{ ticker, companyName, weekEndDate, messageTitle, messageShortSummary }`).
- Throws a typed `AppError` (`src/core/errors.ts`) if the payload is missing required fields — this causes the message to be acknowledged without processing rather than retried indefinitely.
