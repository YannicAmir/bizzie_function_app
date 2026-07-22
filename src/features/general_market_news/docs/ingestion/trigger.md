# trigger.ts

Cloud Function entry point. Instantiates service dependencies at module scope (single composition root) and delegates to the use case. Contains no business logic. Modeled directly on [stock_news_notifier/trigger.ts](../../../stock_news_notifier/docs/ingestion_and_messaging/trigger.md).

`FMP_API_KEY` is declared with `defineSecret('FMP_API_KEY')` from `firebase-functions/params` and bound via `secrets: [fmpApiKey]` — the same secret `stock_news_notifier` uses, injected as `process.env.FMP_API_KEY` at runtime. Collection names and the feature name come from `constants/index.ts` — no string literals in this file.

[← back to overview](overview.md)

---

## `generalMarketNews`

| Config | Value |
|---|---|
| Type | `onSchedule` |
| Schedule | `* * * * *` (every minute, all day — no time-of-day restriction) |
| Timezone | `America/New_York` — used only for `publishedDate` parsing consistency, not schedule gating |
| Memory | `256MiB` |
| Timeout | `60s` — hard upper bound; must stay below the 1-minute schedule interval |
| Max instances | `1` — first guard against overlapping runs (lease is the second) |
| Secrets | `FMP_API_KEY` (via `defineSecret`) |

**The trigger fires every minute regardless of poll cadence.** The Cloud Scheduler cron is fixed at the finest interval the pipeline will ever need (`* * * * *`). Whether a given tick actually calls FMP is decided inside the use case by comparing `runIntervalSeconds` (Remote Config, default 300s) against how long it's been since the last run — see step 1 of [usecase.md](usecase.md). This makes poll frequency a runtime switch (e.g. 300 → 60 to go from every 5 minutes to every minute) with no redeploy and no Cloud Scheduler edit.

**Operational kill switch:** no Remote Config flag fully disables the function — pause/resume the Cloud Scheduler job directly in the GCP console to stop it completely. Raising `runIntervalSeconds` slows polling but each tick still costs one function invocation (cheap: a single Firestore transactional read, no FMP call, when the interval hasn't elapsed). The cursor makes resuming after a pause safe: the first run detects it is behind the watermark and catches up via deeper pages or the ranged backfill, with no gap and no duplicates.

**No time-of-day gap:** unlike `stock_news_notifier`, which skips 12:00–3:59am EST because it only cares about watched-ticker activity, this feed runs around the clock — general market news (e.g. overnight Asia/Europe coverage) is relevant at all hours.

**Steps:**

1. Reads `process.env.FMP_API_KEY`; if missing, logs an error and returns (no retry — misconfiguration is not transient).
2. Instantiates `GeneralMarketNewsUseCase` with `FmpNewsService` and `FirestoreService`, then calls `execute()` — see [usecase.md](usecase.md).
3. On use-case error: logs the error and swallows it. The scheduler fires again in ≤ 1 minute and the cursor guarantees the failed window is re-covered; re-throwing would only trigger a redundant Cloud Scheduler retry racing the next tick.
