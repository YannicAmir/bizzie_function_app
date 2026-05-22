# trigger.ts

Cloud Function entry points. Instantiates service dependencies and delegates to services. Contains no business logic.

---

## `weeklyRecapRetrievalScheduler`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `30 16 * * 5` (every Friday, 4:30pm EST) |
| Timezone | `America/New_York` |
| Memory | `512MiB` |
| Timeout | `300s` |

Delegates to `RetrievalSchedulerUsecase.execute()`. Catches and logs any thrown error at `error` level.

**On-error behaviour:** If no subscribed users are found after step 1, logs `warn` and exits cleanly — no Redis writes, no Pub/Sub messages.

---

## `weeklyRecapDeliveryProcessor`

| Config | Value |
|---|---|
| Type | `onMessagePublished` (Pub/Sub) |
| Topic | `weekly-recap-delivery` |
| Memory | `256MiB` |
| Timeout | `60s` |

Delegates to `DeliveryProcessorUsecase.execute(message)`. Catches and logs any thrown error at `error` level — does not re-throw so the Pub/Sub message is acknowledged.

**On-error behaviour:** logs and returns without re-throwing — acknowledges the message and prevents an infinite retry loop. Pub/Sub retries up to 5 times before routing to the dead-letter topic on `weekly-recap-delivery`. See [../../storage/dead-letter-setup.md](../../storage/dead-letter-setup.md) for dead-letter configuration.
