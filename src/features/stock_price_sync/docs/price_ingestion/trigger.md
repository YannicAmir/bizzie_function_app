# trigger.ts

Cloud Function entry point and composition root. Wires service dependencies and delegates to the use case; contains no business logic. Stateless singletons (`FirestoreService`, `FirebaseWatchlistService`) are built at module scope; the API-key-dependent services (`FmpChartService`, `FmpEodService`) are lazily memoized on first invocation (`??=`) since the secret is only available inside the handler.

`FMP_API_KEY` is declared with `defineSecret('FMP_API_KEY')` from `firebase-functions/params` and bound via `secrets: [fmpApiKey]` — Firebase injects it as `process.env.FMP_API_KEY` at runtime (locally from `.secret.local`, deployed from GCP Secret Manager). The feature name, collection names, schedule, and the **function-deployment constants** (`FUNCTION_MEMORY`, `FUNCTION_TIMEOUT_SECONDS`, `FUNCTION_MAX_INSTANCES`) come from `constants/index.ts` — no literals in this file.

[← back to overview](overview.md)

---

## `stockPriceSync`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `* 9-16 * * 1-5` — cron fires 9:00am–4:59pm ET weekdays; the use case's phase gate routes execution into **pre-open EOD seed (9:15–9:29)**, **intraday 1-min (9:30–4:05pm)**, and **post-close EOD finalize (4:20pm–4:59pm)**; all other minutes exit idle (cron cannot express these boundaries) |
| Timezone | `America/New_York` |
| Memory | `FUNCTION_MEMORY` = `256MiB` |
| Timeout | `FUNCTION_TIMEOUT_SECONDS` = `60s` — hard upper bound; must stay below the 1-minute schedule interval (and above `RUN_DURATION_WARN_MS`, the soft warn threshold) |
| Max instances | `FUNCTION_MAX_INSTANCES` = `1` — overlapping runs are prevented here; no lease is needed because writes are idempotent full snapshots (see [design-decisions.md](design-decisions.md)) |
| Secrets | `FMP_API_KEY` (via `defineSecret`) |

**Operational kill switch:** no Remote Config flag — pause/resume the function's Cloud Scheduler job directly in the GCP console. Resuming is trivially safe: the first run after a pause rebuilds every snapshot from scratch, so there is no catch-up logic and no gap to repair.

**The three phases.** The market's regular session is 9:30am–4:00pm ET.
- **Pre-open EOD seed (9:15–9:29)** front-loads the per-ticker EOD calls that establish `previousClose` (the prior session's official close) before the intraday hot path starts — so `change`/`changePercent` are ready at the open.
- **Intraday (9:30–4:05pm)** runs the 1-min snapshot loop; the 1-min endpoint is near-real-time (verified — no 15-minute delay on it), so the window opens with the session and the 4:05pm run captures the last (15:59) bar.
- **Post-close EOD finalize (4:20pm+)** replaces each ticker's last-trade `price` with the **official closing-auction price** from the EOD endpoint (which is ~15-min delayed, hence the 4:20pm start). It is guarded on the EOD record's `date === today`, so it no-ops and retries harmlessly until the official close publishes, then self-disables for the day.

No extended-hours data on the plan, so there is no premarket window to widen into (resolved decisions in [tech-stack.md](tech-stack.md)).

**Steps:**

1. Reads `process.env.FMP_API_KEY`; if missing, logs an error and returns (no retry — misconfiguration is not transient).
2. Lazily memoizes `FmpChartService` / `FmpEodService` (both wrap the shared [fmp_client.ts](fmp-client.md)), then instantiates `StockPriceSyncUseCase` with `FmpChartService`, a `PreviousCloseResolver` wrapping `FmpEodService`, `FirestoreService`, and the core `FirebaseWatchlistService`, and calls `execute()` — the use case's step 1 applies the phase gate; see [usecase.md](usecase.md).
3. On use-case error: logs the error and swallows it. The scheduler fires again in ≤ 60 seconds and the next run rebuilds; re-throwing would only trigger a redundant Cloud Scheduler retry racing the next tick.
