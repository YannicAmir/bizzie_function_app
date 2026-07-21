# trigger.ts — Cloud Function Entry Point

Exports the `ytdPriceSync` scheduled Cloud Function and acts as the composition root: `getFirebaseAdmin()` at module load, `FMP_API_KEY` as a `defineSecret`, singleton service instances reused across warm invocations. Mirrors [stock_price_sync/trigger.ts](../../../stock_price_sync/trigger.ts).

[← back to overview](overview.md)

---

## Config

| Setting | Value | Source constant |
|---|---|---|
| Trigger | `onSchedule` (`firebase-functions/v2/scheduler`) | — |
| Schedule | `0 10,12,14,17 * * 1-5` | `SCHEDULE` |
| Timezone | `America/New_York` | `TIMEZONE` |
| Memory | `256MiB` | `FUNCTION_MEMORY` |
| Timeout | `300` s | `FUNCTION_TIMEOUT_SECONDS` |
| Max instances | `1` | `FUNCTION_MAX_INSTANCES` |
| Secrets | `FMP_API_KEY` | `defineSecret('FMP_API_KEY')` |

The four cron minutes `10,12,14,17` map to 10:00, 12:00, 14:00 and 17:00 in `America/New_York`; the scheduler resolves DST automatically. Unlike `stock_price_sync` there is **no in-code phase gate** — the schedule expresses the full policy (four discrete fires), so every invocation runs the complete pipeline. The 300 s timeout (vs `stock_price_sync`'s 60 s) reflects that each fire processes the **whole** watchlist rather than a per-minute cohort; `maxInstances: 1` keeps last-write-wins correct (see [design-decisions.md](design-decisions.md#no-lease-no-cohort-no-phase-gate)).

**Kill switch:** pause the Cloud Scheduler job in the GCP console — there is no `enabled` flag in Remote Config.

---

## Entry point steps

1. Read `process.env.FMP_API_KEY`. If missing → `logger.error('Missing FMP_API_KEY')` and return (no throw).
2. Lazily construct the singleton `FmpEodService(apiKey)` (guarded with `??=`, like `stock_price_sync`). `FirestoreService` and `FirebaseWatchlistService` are constructed once at module scope and reused across warm invocations.
3. Construct `YtdPriceSyncUseCase(fmpEodService, firestoreService, watchlistService)`.
4. `await useCase.execute()` inside `try/catch`; on error → `logger.error('YTD price sync run failed', error)`. The catch guarantees a thrown error never becomes a crash loop — the next scheduled fire is the retry.
