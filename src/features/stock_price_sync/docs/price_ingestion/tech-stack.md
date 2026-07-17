# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `* 9-16 * * 1-5`, gated in code to **9:30am–4:05pm ET** (cron cannot express these boundaries; the gate is the first use-case step) |
| Database | Google Cloud Firestore — `stock_prices/{ticker}` snapshot docs (no TTL, no indexes) |
| Market data | FMP REST API — `stable/historical-chart/1min` (the confirmed-accessible endpoint on the current plan) |
| Secrets | GCP Secret Manager — `FMP_API_KEY` via `defineSecret` |
| Retry / backoff | `src/core/retry.ts` |
| Logging | `src/core/logger.ts` |
| Config | `src/core/remote-config.ts` — new `stock_prices` block (below) |

No LLM, no Pub/Sub, no Redis, no FCM — the run is a stateless snapshot refresh; a single function with bounded concurrency covers it (the Pub/Sub evaluation is in [design-decisions.md](design-decisions.md)).

---

## Remote Config — new key `stock_prices_config`

Created with the **JSON data type** in the Firebase console (like `stock_news_config`). Parsed by `src/core/remote-config.ts` with `JSON.parse` into `AppConfig.stock_prices`:

```typescript
stock_prices: {
  fetchConcurrency: number;       // default 8    — parallel FMP calls; the FMP-politeness / runtime-budget dial
  maxCallsPerRun: number;         // default 0    — 0 = all tickers every run; > 0 = round-robin cohorts (rate-limit throttle)
  watchlistCacheSeconds: number;  // default 300  — per-instance watchlist cache TTL
  seriesBucketMinutes: number;      // default 5  — series downsample bucket; 1 = store every raw bar
  seedFallbackCalendarDays: number; // default 6  — widened seed window when the narrow seed finds no prior session
}
```

Every tuning knob is runtime-adjustable without a deploy. Defaults live in `DEFAULT_CONFIG`. No `enabled` flag — pausing the Cloud Scheduler job is the kill switch (see [trigger.md](trigger.md)).

---

## Retry Strategy

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| FMP bar fetch, per ticker (`fmp_chart_service.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |
| Watchlist fetch (core service) | 3 | 1000ms | 2 | 1s → 2s → throw |

**Transient (retried):** HTTP 429/5xx, network failures. **Permanent (not retried):** run-level — a failed ticker or run is simply stale until the next minute's full rewrite; the schedule is the retry. Firestore writes are never retried in-process for the same reason.

**Per-item isolation:** each ticker's fetch + write is individually caught — see the failure table in [usecase.md](usecase.md).

---

## FMP Plan Limits — confirmed 2026-07-16 (Usage & Limits dashboard)

| Limit | Value | This feature's budget (~500 tickers) |
|---|---|---|
| API calls / min | **1,500** (Enterprise plan) | ~500/min ≈ 33% — leaves ample headroom for `stock_news_notifier` and future features; keep total app usage ≤ ~1,000/min |
| Bandwidth / rolling 30 days | **500 GB** | Today-only fetches (0→43 KB payloads) ≈ 8.4 MB/ticker/trading-day → ~4.2 GB/day → **~92 GB/30d ≈ 18%** (+ one narrow seed/ticker/day ≈ 25 MB/day — negligible) |
| Price data delay | **None on the 1-min chart endpoint** (verified — the plan's 15-min delay applies to quotes, not this endpoint) | Gate runs 9:30am–4:05pm: opens with the session; the 4:05 final run captures the complete session including the close |
| Extended hours | **Not included** | Schedule stays regular-session; no premarket window |

The bandwidth cap is the binding constraint: a multi-day fetch window every minute would total ~570 GB/30d and exceed it — hence the **two-mode fetch** ([fmp-chart-service.md](fmp-chart-service.md)): today-only per run, plus one weekday-aware narrow seed per ticker per day for `previousClose` (with a widen-on-miss fallback for post-holiday mornings). `maxCallsPerRun` stays at its default `0` (no cohorting) — it exists as the live throttle if the watchlist ever grows toward the call or bandwidth ceilings.

---

## Cost Envelope (defaults, ~500 watched tickers)

| Resource | Volume |
|---|---|
| FMP calls | ~500/min × ~396 gated-min/day ≈ 198k/day — ~33% of the 1,500/min quota |
| FMP bandwidth | ~4 GB/trading-day ≈ 90 GB/30d — ~18% of the 500 GB cap |
| Firestore writes | ≤ 500 × ~396 gated-min ≈ 198k/day (unchanged-skip suppresses no-new-bar runs, e.g. holidays) |
| Firestore reads | watchlist 500 × ~77/day (5-min cache) ≈ 39k/day |
| Function invocations | ~481/day (gate exits cost milliseconds outside 9:30–4:05) × ~10–30s runtime @ 256MiB |

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| FMP per-minute quota | Enterprise plan, 1,500 calls/min — confirmed from the Usage & Limits dashboard. ~500-ticker runs use ~33%; no cohorting needed at current scale. |
| FMP bandwidth cap | 500 GB / rolling 30 days — drove the today-only fetch window (~18% utilization). Monitor the dashboard the first week in prod. |
| Extended hours | Not on the plan — regular session only; no premarket schedule window. |
| Data delay & window | The 1-min chart endpoint is near-real-time — the plan's 15-minute delay was verified **not** to apply to it. Gate runs 9:30am–4:05pm ET: opens with the session, and the 4:05 final run captures the complete session including the 4:00pm close. |
| Storage scope | **Current-session series only** — `series` never contains more than today's bars; the only prior-session value stored is the `previousClose` scalar (and its derived `change`/`changePercent`). |
| Series downsampling | `series` stores one point per `seriesBucketMinutes` bucket (default 5 → ~79 points, ~2 KB doc vs ~10 KB raw). Visually identical on a mini sparkline (fewer horizontal pixels than points); `price`/`latestBarAt` stay minute-fresh from the newest raw bar. Shrinks every front-end fetch ~5×; a future full-resolution detail chart would fetch FMP separately or lower the knob. |
| Change vs previous close | **Included** (decision reversed 2026-07-17): `previousClose`/`change`/`changePercent` are stored, measured against the prior trading session's final 1-min bar close (≈ official close ± a cent or two), sourced by one seed fetch per ticker per day on the same endpoint — no quote or EOD endpoint needed. |
| Seed window strategy | **Weekday-aware narrow seed + widen-on-miss fallback** (no holiday-calendar dependency): Mondays fetch back to Friday (`today − 3`), Tue–Fri fetch `today − 1`; a response with no prior session (holiday/ad-hoc closure) triggers one widened retry (`today − seedFallbackCalendarDays`). Generic holiday packages are wrong for NYSE (Good Friday closed; Columbus/Veterans Day open) and no calendar predicts ad-hoc closures — the market data itself is the calendar. |
| Off-hours retention | Documents are never blanked — overnight/weekends/holidays each doc retains the last completed session and the front end simply renders the latest available data (`sessionDate` identifies the session). |
| Price staleness | Prices are at most ~60s behind the feed (the poll cadence; × `numCohorts` if throttling is ever enabled) — accepted for a watchlist row. If true tick-level real-time is ever a product requirement, that is a websocket/streaming-provider architecture, not a faster poll — out of scope. |

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | Front end: confirm the sparkline consumes `series` as-is (~79 pre-downsampled points) and that reads of `stock_prices/{ticker}` fit the security rules (read-only to authenticated clients, writes denied). |
| 2 | After the first week in prod, check the FMP Usage & Limits dashboard against the ~92 GB/30d bandwidth projection. |
