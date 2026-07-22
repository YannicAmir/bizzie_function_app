# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `*/10 * * * *`; fires every 10 minutes, every day (144 fires/day), no in-code time gate ([trigger.md](trigger.md)) |
| Database | Google Cloud Firestore — `ytd_price_change/{ticker}` snapshot docs (no TTL, no indexes) |
| Market data | FMP REST API — `stable/historical-price-eod/light` — daily closes for the baseline and latest close ([fmp-eod-service.md](fmp-eod-service.md)) |
| FMP transport | `services/fmp_client.ts` — shared windowed-GET client (retry, 10s timeout, transient policy); the EOD service is a thin endpoint config over it ([fmp-client.md](fmp-client.md)) |
| Concurrency | `src/core/concurrency.ts` — `runWithConcurrency` bounded worker pool |
| Secrets | GCP Secret Manager — `FMP_API_KEY` via `defineSecret` |
| Retry / backoff | `src/core/retry.ts` (centralized in `fmp_client.ts` for FMP calls) |
| Logging | `src/core/logger.ts` |
| Config | `src/core/remote-config.ts` — `ytd_price_change` block (below) |

No LLM, no Pub/Sub, no Redis, no FCM, and no phase gate or cohort sharding — the run is a stateless full recompute; a single scheduled function with bounded concurrency covers it (see [design-decisions.md](design-decisions.md)). Orchestration is thin: `usecase.ts` owns the run sequence and `snapshot.ts` holds the pure derivation.

---

## Remote Config — key `ytd_price_change_config`

Created with the **JSON data type** in the Firebase console (like `stock_prices_config`). Parsed by `src/core/remote-config.ts` and **merged over `DEFAULT_CONFIG.ytd_price_change`** (so a new field keeps its default against a stale live template — the same pattern as `stock_prices` / `general_market_news`):

```typescript
ytd_price_change: {
  fetchConcurrency: number;             // default 8    — parallel FMP calls; FMP-politeness / runtime-budget dial
  watchlistCacheSeconds: number;        // default 300  — per-instance watchlist cache TTL
  baselineLookbackCalendarDays: number; // default 15   — days before Jan 1 to widen the fetch so the prior-year final close is in range
}
```

Wiring required in `remote-config.ts`: add the `YtdPriceChangeConfig` interface, the `ytd_price_change` field on `AppConfig`, a `DEFAULT_CONFIG.ytd_price_change` block, and a `rawYtdPriceChange` parse line that merges over the default. There is **no `maxCallsPerRun` / cohort knob** and **no `enabled` flag** — pausing the Cloud Scheduler job is the kill switch.

---

## Retry Strategy

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| EOD-light fetch, via `fmp_client.ts` | 3 | 1000ms | 2 | 1s → 2s → throw |
| Watchlist fetch (core service) | 3 | 1000ms | 2 | 1s → 2s → throw |

**Transient (retried):** HTTP 429/500/502/503/504, network failures, timeouts (10s per request). **Not retried:** a `422` non-array body or a malformed-JSON `SyntaxError` (an FMP contract change — fail fast); and run-level, a failed ticker or run is simply stale until the next fire's full recompute — the schedule is the retry. Firestore writes are never retried in-process. **Per-item isolation:** each ticker's fetch + write is individually caught (see the table in [usecase.md](usecase.md)).

---

## FMP Plan Limits — Enterprise (confirmed 2026-07-16)

| Limit | Value | This feature's budget (~500 tickers) |
|---|---|---|
| API calls / min | **1,500** | One ~500-call burst per fire (fires are 10 min apart, never concurrent) — ≤ 33% of quota for a few seconds, not sustained; trivially within limit |
| Bandwidth / rolling 30 days | **500 GB** | ~140-row daily series per ticker ≈ a few KB/call → ~500 × 144/day ≈ **~200 MB/day → ~6 GB/30d, well within cap** |
| Price data delay | **EOD light: ~15-min delayed** | `latestClose` is ~15 min behind during the session; the 17:00 fire captures today's finalized close |
| Extended hours | **Not included** | Irrelevant — daily closes only |
| Bulk / batch EOD | **Not on the plan** | Per-ticker fan-out, bounded by `fetchConcurrency` |

---

## Cost Envelope (defaults, ~500 watched tickers)

| Resource | Volume |
|---|---|
| FMP EOD calls | ~500 × 144 fires ≈ **72k/day** (+ retries only on transient blips) |
| FMP bandwidth | ~500 × 144 × a few KB ≈ **~200 MB/day** — ~6 GB/30d, a small fraction of the 500 GB cap |
| Firestore writes | ≤ 500 × 144 ≈ **72k/day** (full-overwrite `set()`) |
| Firestore reads | watchlist 500 × 144 ≈ **72k/day** — fires are 10 min apart and the watchlist cache TTL is 300s, so each fire re-reads; raise `watchlistCacheSeconds` above 600 to halve this if desired |
| Function invocations | **144/day** × ~10–30s runtime @ 256MiB |

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| **Baseline** | Prior trading year's **official final close** (newest EOD record with `date < Jan 1`); for a ticker that first listed in the current year, **falls back to the first available close of the current year** so mid-year watchlist additions still get a document (same shape, no `baselineSource` field). See [design-decisions.md](design-decisions.md#baseline--prior-year-final-close). |
| **"Current" value** | Latest EOD-light record in the same response — includes today's ~15-min-delayed row intraday, so fires during the session advance it. No separate live-intraday source (declined). |
| **Full-year fetch window** | `from = Jan 1 − baselineLookbackCalendarDays` (default 15 → mid-Dec prior year) captures the prior-year final close across the holiday break; closed days are simply absent, so no holiday calendar is needed. |
| **No phase / cohort / lease** | Four discrete fires and one call per ticker — no cron phase gate, no `maxCallsPerRun` sharding, no transactional lease; `maxInstances: 1` + last-write-wins suffices. See [design-decisions.md](design-decisions.md#no-lease-no-cohort-no-phase-gate). |
| **No unchanged-skip cache** | At 4 runs/day the write volume is trivial and every run yields a fresh `latestClose`; the skip machinery `stock_price_sync` needs is omitted. |
| **`ytdChangePercent` units** | A percentage number (`12.34` = +12.34%), matching `stock_price_sync`'s `changePercent` = `(change / base) × 100` — identical formula, so the front end sees the same unit as the existing price feed. |
| **Current-year listings** | Not skipped. A ticker that first listed in the current year gets a baseline of its **first current-year close** (first session), so every watchlisted company — including mid-year additions — is backed by a `ytd_price_change` doc. See [design-decisions.md](design-decisions.md#baseline--prior-year-final-close). |
| **Stale documents** | No cleanup pass — tickers are never removed from the global watchlist, so documents are only ever created or overwritten. |
| **Manual harness** | `_manual_harness.ts` + `npm run harness:ytd-sync -- --project <dev\|qa\|prod>` — runs the pipeline end-to-end locally against a fixed ticker set. |

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | **Adjusted vs unadjusted close.** Confirm `historical-price-eod/light` (with `nonadjusted` omitted) returns split/dividend-**adjusted** closes, so a split between Jan 1 and today does not distort the YTD %. If it returns unadjusted, decide whether to pass `nonadjusted=false` explicitly or adjust in code. |
| 2 | **Front-end read fit.** Confirm reads of `ytd_price_change/{ticker}` fit the security rules (read-only to authenticated clients, writes denied). |
