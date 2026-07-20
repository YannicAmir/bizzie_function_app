# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `* 9-16 * * 1-5`, gated in code into three ET phases: **pre-open EOD seed 9:15–9:29**, **intraday 1-min 9:30–4:05pm**, **post-close EOD finalize 4:20pm onward** (cron cannot express these boundaries; the gate dispatches phases — see [trigger.md](trigger.md)) |
| Database | Google Cloud Firestore — `stock_prices/{ticker}` snapshot docs (no TTL, no indexes) |
| Market data (intraday) | FMP REST API — `stable/historical-chart/1min` — live series + intraday last price |
| Market data (official close) | FMP REST API — `stable/historical-price-eod/light` — authoritative auction close for `previousClose` and the finalized session close ([fmp-eod-service.md](fmp-eod-service.md)) |
| FMP transport | `services/fmp_client.ts` — shared windowed-GET client (retry, 10s timeout, transient policy); the two FMP services are thin endpoint configs over it ([fmp-client.md](fmp-client.md)) |
| Concurrency | `src/core/concurrency.ts` — `runWithConcurrency` bounded worker pool |
| Secrets | GCP Secret Manager — `FMP_API_KEY` via `defineSecret` |
| Retry / backoff | `src/core/retry.ts` (centralized in `fmp_client.ts` for FMP calls) |
| Logging | `src/core/logger.ts` |
| Config | `src/core/remote-config.ts` — `stock_prices` block (below) |

No LLM, no Pub/Sub, no Redis, no FCM — the run is a stateless snapshot refresh; a single time-phased function with bounded concurrency covers it (the Pub/Sub evaluation is in [design-decisions.md](design-decisions.md)). Orchestration is decomposed into focused modules — `phase.ts` (gate), `cohort.ts` (sharding), `previous_close.ts` (EOD resolution + warm cache), `snapshot.ts` (pure derivation) — with `usecase.ts` owning only the run sequence.

---

## Remote Config — key `stock_prices_config`

Created with the **JSON data type** in the Firebase console (like `stock_news_config`). Parsed by `src/core/remote-config.ts` with `JSON.parse` into `AppConfig.stock_prices`:

```typescript
stock_prices: {
  fetchConcurrency: number;         // default 8    — parallel FMP calls; the FMP-politeness / runtime-budget dial
  maxCallsPerRun: number;           // default 0    — 0 = all tickers every run; > 0 = round-robin cohorts (rate-limit throttle)
  watchlistCacheSeconds: number;    // default 300  — per-instance watchlist cache TTL
  seriesBucketMinutes: number;      // default 5    — series downsample bucket; 1 = store every raw bar
  eodLookbackCalendarDays: number;  // default 4    — narrow EOD window for the prior-session close (covers a long weekend)
  eodFallbackCalendarDays: number;  // default 10   — widened EOD window when the narrow window finds no prior session (holiday cluster)
}
```

Every tuning knob is runtime-adjustable without a deploy. Defaults live in `DEFAULT_CONFIG`. Phase-boundary minutes (9:15 / 9:30 / 4:05 / 4:20) are compile-time constants in `constants/index.ts` — they never need live tuning because the finalize step is **guarded on the EOD record's date, not the clock** (see below), so the exact minute is not load-bearing. No `enabled` flag — pausing the Cloud Scheduler job is the kill switch (see [trigger.md](trigger.md)).

> **Migration note:** the earlier `seedFallbackCalendarDays` knob (widen-on-miss for the *1-min* previous-close seed) is removed. The 1-min seed is gone — `previousClose` now comes from the EOD endpoint — and its window knobs are replaced by `eodLookbackCalendarDays` / `eodFallbackCalendarDays`.

---

## Retry Strategy

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| All FMP fetches (1-min + EOD), via `fmp_client.ts` | 3 | 1000ms | 2 | 1s → 2s → throw |
| Watchlist fetch (core service) | 3 | 1000ms | 2 | 1s → 2s → throw |

**Transient (retried):** HTTP 429/500/502/503/504, network failures, timeouts (10s per request). **Not retried:** a `422` non-array body or a malformed-JSON `SyntaxError` (an FMP contract change — fail fast), and run-level — a failed ticker or run is simply stale until the next run's full rewrite; the schedule is the retry. Firestore writes are never retried in-process for the same reason. The FMP retry/timeout/transient policy lives once in [fmp-client.md](fmp-client.md).

**Per-item isolation:** each ticker's fetch + write is individually caught — see the failure table in [usecase.md](usecase.md).

---

## FMP Plan Limits — confirmed 2026-07-16 (Usage & Limits dashboard)

| Limit | Value | This feature's budget (~500 tickers) |
|---|---|---|
| API calls / min | **1,500** (Enterprise plan) | Intraday ~500/min ≈ 33%. EOD adds **≤ 2 calls/ticker/day** (one pre-open seed + one post-close finalize) — batched into two short bursts (~500 each), not sustained; trivially within quota — keep total app usage ≤ ~1,000/min |
| Bandwidth / rolling 30 days | **500 GB** | Intraday today-only fetches ≈ **~92 GB/30d ≈ 18%**. EOD light records are tiny (~a few KB/ticker/call) → ~1,000 calls/day ≈ a few MB/day → **negligible** |
| Price data delay | **1-min endpoint: none** (verified). **EOD light: ~15-min delayed** — today's EOD record appears ~16:15 ET | Intraday opens with the session; the post-close finalize runs from **4:20pm**, guarded on the EOD record's `date === today` so it no-ops until the official close is published |
| Extended hours | **Not included** | Regular session only; no premarket window |
| Bulk / batch EOD | **Not on the plan** (confirmed) | Per-ticker EOD fan-out, same pattern as the 1-min fetch |

The intraday bandwidth cap remains the binding constraint and is unchanged by the EOD addition (EOD payloads are a rounding error). `maxCallsPerRun` stays at its default `0`.

---

## Cost Envelope (defaults, ~500 watched tickers)

| Resource | Volume |
|---|---|
| FMP 1-min calls | ~500/min × ~396 gated-min/day ≈ 198k/day — ~33% of the 1,500/min quota |
| FMP EOD calls | ~500 pre-open + ~500 post-close ≈ **~1k/day** (+ ~1 widened retry/ticker on the ~handful of holiday-cluster mornings/year) |
| FMP bandwidth | ~4 GB/trading-day ≈ 90 GB/30d — ~18% of the 500 GB cap (EOD adds a few MB/day) |
| Firestore writes | Intraday ≤ 500 × ~396 gated-min ≈ 198k/day (unchanged-skip suppresses no-new-bar runs) + ~500 finalize writes/day |
| Firestore reads | watchlist 500 × ~77/day (5-min cache) ≈ 39k/day |
| Function invocations | intraday ~396/day + pre-open ~15 + post-close ~40 (gate exits cost milliseconds outside a phase) × ~10–30s runtime @ 256MiB |

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| **Official close vs 1-min last trade** | The 1-min endpoint's final bar (15:59) is a last-trade price and **misses the 16:00 closing auction** — confirmed the two differ end-to-end. `price` (at/after close) and `previousClose` are therefore sourced from the **EOD light endpoint's official close**, not from 1-min bars. See [design-decisions.md](design-decisions.md). |
| **Change vs previous close** | `previousClose`/`change`/`changePercent` measure the day's move against the **prior session's official EOD close** (the exact auction close, not ± a cent). Sourced by one EOD windowed fetch per ticker per day; both are `null` when the EOD close is unavailable (`null` or `0`). |
| **Prior-session lookup (EOD)** | **Narrow EOD window (`today − eodLookbackCalendarDays`, default 4) + widen-on-miss (`today − eodFallbackCalendarDays`, default 10)** — mirrors the retired 1-min seed pattern but on daily records, where closed days are simply absent, so "newest record before today" is always the correct prior session. Zero holiday-calendar dependency. |
| **Today's close finalization** | A **post-close EOD finalize** phase (4:20pm+) overwrites `price` with the official close, appends a synthetic 16:00 series point (series tip stays equal to `price`), and sets `closeFinalized = true`. Guarded on `EOD.date === today` so it no-ops until the ~15-min-delayed record publishes; self-disabling for the rest of the day via an in-memory marker. |
| **1-min seed removed** | The former weekday-aware 1-min previous-close seed (narrow + widen-on-miss) is **deleted** — EOD supersedes it, more accurately and with less code. |
| FMP per-minute quota | Enterprise, 1,500 calls/min. Intraday ~33%; EOD adds two short ~500-call bursts/day — no cohorting needed at current scale. |
| FMP bandwidth cap | 500 GB / rolling 30 days — drove the intraday today-only window (~18%). EOD payloads negligible. Monitor the dashboard the first week in prod. |
| Extended hours | Not on the plan — regular session only. |
| Storage scope | **Current-session series only** — `series` never contains more than today's bars (plus the synthetic 16:00 close point after finalize); the only prior-session value stored is the `previousClose` scalar and its derived `change`/`changePercent`. |
| Series downsampling | `series` stores one point per `seriesBucketMinutes` bucket (default 5 → ~79 points, ~2 KB). Finalize appends a 16:00 official-close point. `price`/`latestBarAt` stay minute-fresh intraday from the newest raw bar; `price` becomes the official close after finalize. |
| Off-hours retention | Documents are never blanked — overnight/weekends/holidays each doc retains the last completed session (with `closeFinalized = true`, so the overnight-displayed price is the official close). `sessionDate` identifies the session. |
| Price staleness | Intraday prices ≤ ~60s behind the feed; the official close lands by ~16:20 (one finalize pass). |

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | Front end: confirm the sparkline consumes `series` as-is (~79 pre-downsampled points + the 16:00 close point) and that reads of `stock_prices/{ticker}` fit the security rules (read-only to authenticated clients, writes denied). |
| 2 | After the first week in prod, check the FMP Usage & Limits dashboard against the ~92 GB/30d bandwidth projection and confirm EOD calls stay negligible. |
| 3 | Confirm `historical-price-eod/light` returns the **unadjusted** close (so intraday 1-min prices and `previousClose` are on the same scale on ex-div/split days). |
