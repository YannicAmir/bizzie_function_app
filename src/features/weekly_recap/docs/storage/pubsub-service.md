# services/pubsub_service.ts

Handles all Pub/Sub interactions for the storage pipeline: publishing per-company messages from the scheduler and deserialising them in the processor. No business logic — pure message transport.

Uses the `@google-cloud/pubsub` client. Topic and project resolved from `config.projectId` (`src/core/config.ts`). Logger instantiated as `new Logger('WeeklyRecap/Storage/PubSubService')` from `src/core/logger.ts`.

---

## Topic

| Key | Value |
|---|---|
| Topic name | `weekly-recap` |
| Message payload | `{ ticker: string, companyName: string }` |
| Encoding | JSON, base64-encoded by the Pub/Sub SDK |

---

## Functions

### `queueCompanies(companies: Company[]): Promise<void>`

Called by `weeklyRecapScheduler` after `retrieveCompaniesFromDb()`. `Company` is `{ ticker: string, companyName: string }`.

- Iterates over `companies` and publishes one Pub/Sub message per `Company` to the `weekly-recap` topic.
- Each message payload: `{ ticker, companyName }` serialised as JSON. Dates are not included — the processor derives the week window at execution time (see `calculateWeekWindow` in `usecase.ts`).
- Pub/Sub will retry a failed message up to **5 times** before routing it to the dead-letter topic on `weekly-recap`.
- Logs the count of messages published on completion.
- Throws if the Pub/Sub client fails (caught and logged by the scheduler).

---

### `retrieveCompanyFromQueue(message): Company`

Called by `weeklyRecapProcessor` as the first step in handling each Pub/Sub push.

- Decodes the base64 message data and parses the JSON payload.
- Returns the typed `Company` object (`{ ticker, companyName }`).
- Throws a typed `AppError` (`src/core/errors.ts`) if the payload is missing required fields — this causes the message to be acknowledged without processing rather than retried indefinitely.
