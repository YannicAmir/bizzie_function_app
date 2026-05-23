# services/pubsub_service.ts

Handles all Pub/Sub interactions for the storage pipeline: publishing per-company messages from the scheduler and deserialising them in the processor. No business logic — pure message transport.

Uses the `@google-cloud/pubsub` client. Topic and project resolved from `config.projectId` (`src/core/config.ts`). Logger instantiated as `new Logger('WeeklyRecap/Storage/PubSubService')` from `src/core/logger.ts`.

---

## Topic

| Key | Value |
|---|---|
| Topic name | `weekly-recap` (constant `TOPIC_NAME` defined in `constants/index.ts`, imported by both `pubsub_service.ts` and `trigger.ts`) |
| Message payload | `{ ticker: string, companyName: string }` |
| Encoding | JSON, base64-encoded by the Pub/Sub SDK |

---

## Raw DTO

`CompanyMessageRaw` — internal `Readonly<{ ticker?: unknown; companyName?: unknown }>` type used in `retrieveCompanyFromQueue` to represent the parsed payload before field validation. Not exported.

---

## Retry Config

Publish calls are wrapped in `retry()` using `PUBSUB_RETRY_OPTIONS`:

```typescript
const PUBSUB_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
  shouldRetry: isTransientPubSubError,
};
```

`isTransientPubSubError` checks the gRPC status code on the error:

| gRPC code | Meaning | Action |
|---|---|---|
| 4 | DEADLINE_EXCEEDED | Retry |
| 8 | RESOURCE_EXHAUSTED | Retry |
| 13 | INTERNAL | Retry |
| 14 | UNAVAILABLE | Retry |
| All others (3, 5, 7…) | Permanent (invalid arg, not found, permission denied) | Do not retry |

---

## Functions

### `queueCompanies(companies: Company[]): Promise<number>`

Called by `weeklyRecapScheduler` after `retrieveCompaniesFromDb()`. `Company` is `{ ticker: string, companyName: string }`.

- Iterates over `companies` and publishes one Pub/Sub message per `Company` to the `weekly-recap` topic.
- Each message payload: `{ ticker, companyName }` serialised as JSON. Dates are not included — the processor derives the week window at execution time (see `calculateWeekWindow` in `usecase.ts`).
- Each `publishMessage` call is wrapped in `retry()` with `PUBSUB_RETRY_OPTIONS` — transient gRPC errors are retried up to 3 times before falling through to the skip path.
- Per-company error isolation: a publish call that exhausts all retries is caught, logged with the ticker name, and skipped — remaining companies continue to be published.
- Returns the count of successfully published messages so the caller can log `n/total`.
- Logs the final `published/total` count on completion.
- Never throws — all errors are caught per-company.

---

### `retrieveCompanyFromQueue(message): Company`

Called by `weeklyRecapProcessor` as the first step in handling each Pub/Sub push.

- Decodes the base64 message data and parses the JSON payload.
- Casts parsed payload to `CompanyMessageRaw` and validates `ticker` and `companyName` are strings.
- Returns the typed `Company` object (`{ ticker, companyName }`).
- Throws a typed `AppError` (`src/core/errors.ts`) on parse failure (`PUBSUB_DESERIALIZE_ERROR`) or missing fields (`PUBSUB_INVALID_PAYLOAD`) — both with `status: 400`. This causes the message to be acknowledged without processing rather than retried indefinitely.
