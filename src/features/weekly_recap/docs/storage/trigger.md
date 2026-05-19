# trigger.ts

Cloud Function entry points. Instantiates service dependencies and delegates to the use case. Contains no business logic.

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
1. Calls `FirestoreService.retrieveCompaniesFromDb()` to read all company documents from the `watchlist` collection.
2. Calls `PubSubService.queueCompanies(companies)` which publishes one message per `Company` to the `weekly-recap` topic. Each message payload is `{ ticker: string, companyName: string }`. No dates are included — the week window is calculated by the processor at execution time.

---

## `weeklyRecapProcessor`

| Config | Value |
|---|---|
| Type | `onMessagePublished` (Pub/Sub) |
| Topic | `weekly-recap` |
| Memory | `512MiB` |
| Timeout | `300s` |

**Steps:**
1. Calls `PubSubService.retrieveCompanyFromQueue(message)` to decode the Pub/Sub message into a `Company` object.
2. Instantiates `FmpService`, `AiService`, `FirestoreService`, `PubSubService`, and passes them to `WeeklyRecapStorageUseCase`.
3. Calls `useCase.execute(ticker, companyName)`. The use case derives the week window internally.
4. On unrecoverable error: logs and returns without re-throwing — this acknowledges the message and prevents an infinite retry loop. Pub/Sub retries the message up to 5 times before routing it to the dead-letter topic configured on `weekly-recap` in the GCP console.
