# trigger.ts — Cloud Function Entry Point

Exports the `ytdPriceSync` scheduled Cloud Function and acts as the composition root: `getFirebaseAdmin()` at module load, `FMP_API_KEY` as a `defineSecret`, singleton service instances reused across warm invocations. Mirrors [stock_price_sync/trigger.ts](../../../stock_price_sync/trigger.ts).

[← back to overview](overview.md)

---

## Config

| Setting | Value | Source constant |
|---|---|---|
| Trigger | `onSchedule` (`firebase-functions/v2/scheduler`) | — |
| Schedule | `*/10 * * * *` | `SCHEDULE` |
| Timezone | `America/New_York` | `TIMEZONE` |
| Memory | `256MiB` | `FUNCTION_MEMORY` |
| Timeout | `300` s | `FUNCTION_TIMEOUT_SECONDS` |
| Max instances | `1` | `FUNCTION_MAX_INSTANCES` |
| Secrets | `FMP_API_KEY` | `defineSecret('FMP_API_KEY')` |

The cron `*/10 * * * *` fires every 10 minutes, every day (144 fires/day). Unlike `stock_price_sync` there is **no in-code phase gate** — the schedule expresses the full policy, so every invocation runs the complete pipeline. Outside market hours the EOD series is unchanged, so those fires rewrite the same values; because each write is an idempotent full recompute that is harmless. The 300 s timeout (vs `stock_price_sync`'s 60 s) reflects that each fire processes the **whole** watchlist rather than a per-minute cohort; `maxInstances: 1` keeps last-write-wins correct and prevents a slow run from overlapping the next fire (see [design-decisions.md](design-decisions.md#no-lease-no-cohort-no-phase-gate)).

**Kill switch:** pause the Cloud Scheduler job in the GCP console — there is no `enabled` flag in Remote Config.

---

## Entry point steps

1. Read `process.env.FMP_API_KEY`. If missing → `logger.error('Missing FMP_API_KEY')` and return (no throw).
2. Lazily construct the singleton `FmpEodService(apiKey)` (guarded with `??=`, like `stock_price_sync`). `FirestoreService` and `FirebaseWatchlistService` are constructed once at module scope and reused across warm invocations.
3. Construct `YtdPriceSyncUseCase(fmpEodService, firestoreService, watchlistService)`.
4. `await useCase.execute()` inside `try/catch`; on error → `logger.error('YTD price sync run failed', error)`. The catch guarantees a thrown error never becomes a crash loop — the next scheduled fire is the retry.
