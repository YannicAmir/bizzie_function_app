# trigger.ts

Cloud Function entry point. Instantiates service dependencies at module scope (single composition root) and delegates to the use case. Contains no business logic.

`FMP_API_KEY` is declared with `defineSecret('FMP_API_KEY')` from `firebase-functions/params` and bound via `secrets: [fmpApiKey]` — Firebase injects it as `process.env.FMP_API_KEY` at runtime (locally from `.secret.local`, deployed from GCP Secret Manager). Collection names and the feature name come from `constants/index.ts` — no string literals in this file.

[← back to overview](overview.md)

---

## `stockNewsNotifier`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `* 4-23 * * *` (every minute, 4:00am–11:59pm EST; no runs 12:00–3:59am) |
| Timezone | `America/New_York` |
| Memory | `256MiB` |
| Timeout | `60s` — hard upper bound; must stay below the 1-minute schedule interval |
| Max instances | `1` — first guard against overlapping runs (lease is the second) |
| Secrets | `FMP_API_KEY` (via `defineSecret`) |

**Operational kill switch:** no Remote Config flag — pause/resume the function's Cloud Scheduler job directly in the GCP console. The cursor makes this safe: on resume, the first run detects it is behind the watermark and catches up via deeper pages or the ranged backfill, with no gap and no duplicates.

**Overnight window:** the schedule deliberately skips 12:00–3:59am EST. The 4:00am run is a routine catch-up: the cursor is ~4h behind, so it fetches deeper pages (or the ranged backfill) and delivers overnight articles as coalesced ~4:00am notifications — no articles are lost, and the per-ticker cooldown prevents a wake-up burst.

**Steps:**

1. Reads `process.env.FMP_API_KEY`; if missing, logs an error and returns (no retry — misconfiguration is not transient).
2. Instantiates `StockNewsNotifierUseCase` with `FmpNewsService`, `FirestoreService`, `FcmService`, and the core `FirebaseWatchlistService`, then calls `execute()` — see [usecase.md](usecase.md).
3. On use-case error: logs the error and swallows it. The scheduler fires again in ≤ 60 seconds and the cursor guarantees the failed window is re-covered; re-throwing would only trigger a redundant Cloud Scheduler retry racing the next tick.
