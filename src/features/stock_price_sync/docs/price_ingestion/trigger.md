# trigger.ts

Cloud Function entry point. Instantiates service dependencies at module scope (single composition root) and delegates to the use case. Contains no business logic.

`FMP_API_KEY` is declared with `defineSecret('FMP_API_KEY')` from `firebase-functions/params` and bound via `secrets: [fmpApiKey]` — Firebase injects it as `process.env.FMP_API_KEY` at runtime (locally from `.secret.local`, deployed from GCP Secret Manager). Collection names and the feature name come from `constants/index.ts` — no string literals in this file.

[← back to overview](overview.md)

---

## `stockPriceSync`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `* 9-16 * * 1-5` — cron fires 9:00am–4:59pm ET weekdays; the use case's first step gates execution to **9:30am–4:05pm ET** (cron cannot express these boundaries) |
| Timezone | `America/New_York` |
| Memory | `256MiB` |
| Timeout | `60s` — hard upper bound; must stay below the 1-minute schedule interval |
| Max instances | `1` — overlapping runs are prevented here; no lease is needed because writes are idempotent full snapshots (see [design-decisions.md](design-decisions.md)) |
| Secrets | `FMP_API_KEY` (via `defineSecret`) |

**Operational kill switch:** no Remote Config flag — pause/resume the function's Cloud Scheduler job directly in the GCP console. Resuming is trivially safe: the first run after a pause rebuilds every snapshot from scratch (full-session fetch), so there is no catch-up logic and no gap to repair.

**The 9:30–4:05 window:** the market's regular session is 9:30am–4:00pm ET and the 1-min endpoint serves bars near-real-time (verified — no 15-minute delay on this endpoint, despite the plan's delayed-quotes note). The window opens with the session, and the last run at 4:05pm captures the complete session including the 4:00pm close bar. The plan has no extended-hours data, so there is no premarket window to widen into (resolved decisions in [tech-stack.md](tech-stack.md)).

**Steps:**

1. Reads `process.env.FMP_API_KEY`; if missing, logs an error and returns (no retry — misconfiguration is not transient).
2. Instantiates `StockPriceSyncUseCase` with `FmpChartService`, `FirestoreService`, and the core `FirebaseWatchlistService`, then calls `execute()` — the use case's step 1 applies the 9:30–4:05 market-window gate; see [usecase.md](usecase.md).
3. On use-case error: logs the error and swallows it. The scheduler fires again in ≤ 60 seconds and the next run rebuilds every snapshot; re-throwing would only trigger a redundant Cloud Scheduler retry racing the next tick.
