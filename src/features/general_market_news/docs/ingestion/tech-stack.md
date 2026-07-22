# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `* * * * *` (every minute, all day; effective poll cadence gated by Remote Config, see below) |
| Database | Google Cloud Firestore (+ TTL policy on `general_market_news.expireAt`) |
| Market data | FMP REST API — `stable/news/general-latest` |
| Secrets | GCP Secret Manager — `FMP_API_KEY` via `defineSecret` (shared with `stock_news_notifier`) |
| Retry / backoff | `src/core/retry.ts` |
| Logging | `src/core/logger.ts` |
| Config | `src/core/remote-config.ts` — new `general_market_news` block (below) |

No LLM, no Pub/Sub, no Redis, no FCM — same rationale as `stock_news_notifier`: the low per-run workload fits a single scheduled function.

---

## Remote Config — new key `general_market_news_config`

Created with the **JSON data type** in the Firebase console, following the `stock_news_config` precedent (not the legacy string-typed `fmp_config`) so malformed values are rejected at save time. `src/core/remote-config.ts` parses it with `JSON.parse` into `AppConfig.general_market_news`, merged over defaults the same way `stock_prices` is (`{ ...DEFAULT_CONFIG.general_market_news, ...parsed }`) so partial Remote Config payloads don't drop unset fields:

```typescript
general_market_news: {
  pageLimit: number;                    // default 250   — items per FMP page
  maxPages: number;                     // default 4     — latest-feed pages before backfill kicks in
  maxBackfillPages: number;             // default 10    — ranged-fetch safety cap
  overlapWindowSeconds: number;         // default 600   — re-read window behind the cursor
  runIntervalSeconds: number;           // default 300   — min seconds between actual FMP polls (the remote switch)
}
```

Every tuning knob is runtime-adjustable without a deploy. Defaults live in `DEFAULT_CONFIG`. There is deliberately no `enabled` flag — pausing the Cloud Scheduler job in the GCP console is the kill switch (see [trigger.md](trigger.md)).

`pageLimit`/`maxPages`/`maxBackfillPages` defaults are reused as-is from `stock_news_config` as a starting point — see open questions below on tuning for actual general-news volume, which is unfiltered (every publisher, not just watchlisted tickers) and likely higher throughput per page than the per-ticker feed.

### `runIntervalSeconds` — the poll-frequency switch

The Cloud Scheduler trigger fires every minute unconditionally; `runIntervalSeconds` decides how many of those ticks actually call FMP. `FirestoreService.acquireLease(runIntervalSeconds)` compares it against `lastRunAt` on the singleton cursor doc and short-circuits ticks that arrive too soon (see [firestore-service.md](firestore-service.md) and [usecase.md](usecase.md)).

- **Default `300`** (5 minutes) — matches the original fixed-schedule design.
- **Set to `60`** to poll every minute instead — no redeploy, no Cloud Scheduler edit, takes effect on the next tick (config cache TTL is 1 hour in `src/core/remote-config.ts`, so a manual cache-bust or a wait may be needed to see it take effect immediately).
- **Floor is 60** — since the trigger itself only ticks once per minute, any value below `60` has no additional effect.

---

## Retry Strategy

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| FMP page fetch (`fmp_news_service.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |

**Transient (retried):** HTTP 429/5xx, network failures. **Permanent (not retried):** run-level — a failed run simply doesn't advance the cursor; the next scheduled run is the retry. Firestore transactions rely on the SDK's built-in retry.

**Per-item isolation:** article writes are individually caught via `Promise.allSettled` — see the failure table in [usecase.md](usecase.md).

---

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | Confirm `pageLimit`/`maxPages`/`maxBackfillPages` defaults (reused from `stock_news_config`) are sized correctly for general-news volume — this feed is unfiltered and may need a higher `pageLimit` or `maxPages` to reach `overlapCutoff` within one run. |
| 2 | Confirm `overlapWindowSeconds: 600` is sufficient margin against FMP publish/clock skew on this endpoint — it is not auto-derived from `runIntervalSeconds`, so an operator who lowers `runIntervalSeconds` to `60` should sanity-check `overlapWindowSeconds` stays proportionate (a rough ≥2x-the-effective-interval rule is what motivated the `600` default at 300s). |
| 3 | TTL policy must be created per environment (dev/qa/prod) before launch — [ttl-setup.md](ttl-setup.md). |
| 4 | Confirm whether the front end needs a composite index (e.g. `site` or `publisher` equality + `publishedAt` ordering) before adding filters beyond the plain feed query in [data-models.md](data-models.md). |
| 5 | The Cloud Scheduler job bills one function invocation every minute regardless of `runIntervalSeconds` — skipped ticks are cheap (one Firestore transactional read, no FMP call) but not free. Confirm this per-minute invocation floor is acceptable, or whether the schedule itself should be edited when running at a sustained 5+ minute interval for a long period. |
