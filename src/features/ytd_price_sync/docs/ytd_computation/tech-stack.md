# Tech Stack & Retry Strategy

[← back to overview](overview.md)

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2/scheduler`) |
| Scheduling | Google Cloud Scheduler — `0 10,12,14,17 * * 1-5` (`America/New_York`); four discrete fires, no in-code time gate ([trigger.md](trigger.md)) |
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
| API calls / min | **1,500** | One ~500-call burst at each of the four fires — ≤ 33% of quota for a few seconds, not sustained; trivially within limit |
| Bandwidth / rolling 30 days | **500 GB** | ~140-row daily series per ticker ≈ a few KB/call → ~500 × 4/day ≈ **a few MB/day → negligible** |
| Price data delay | **EOD light: ~15-min delayed** | `latestClose` is ~15 min behind during the session; the 17:00 fire captures today's finalized close |
| Extended hours | **Not included** | Irrelevant — daily closes only |
| Bulk / batch EOD | **Not on the plan** | Per-ticker fan-out, bounded by `fetchConcurrency` |

---

## Cost Envelope (defaults, ~500 watched tickers)

| Resource | Volume |
|---|---|
| FMP EOD calls | ~500 × 4 fires ≈ **2k/day** (+ retries only on transient blips) |
| FMP bandwidth | ~500 × 4 × a few KB ≈ **a few MB/day** — a rounding error against the 500 GB cap |
| Firestore writes | ≤ 500 × 4 ≈ **2k/day** (full-overwrite `set()`) |
| Firestore reads | watchlist 500 × 4 ≈ **2k/day** (fires are hours apart, so the 300s cache rarely hits across fires) |
| Function invocations | **4/day** × ~10–30s runtime @ 256MiB |

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| **Baseline** | Always the prior trading year's **official final close** (newest EOD record with `date < Jan 1`) — no fallback, no `baselineSource` field. A ticker with no prior-year record (a current-year listing, not carried on the watchlist) is skipped. See [design-decisions.md](design-decisions.md#baseline--prior-year-final-close). |
| **"Current" value** | Latest EOD-light record in the same response — includes today's ~15-min-delayed row intraday, so all four fires advance it. No separate live-intraday source (declined). |
| **Full-year fetch window** | `from = Jan 1 − baselineLookbackCalendarDays` (default 15 → mid-Dec prior year) captures the prior-year final close across the holiday break; closed days are simply absent, so no holiday calendar is needed. |
| **No phase / cohort / lease** | Four discrete fires and one call per ticker — no cron phase gate, no `maxCallsPerRun` sharding, no transactional lease; `maxInstances: 1` + last-write-wins suffices. See [design-decisions.md](design-decisions.md#no-lease-no-cohort-no-phase-gate). |
| **No unchanged-skip cache** | At 4 runs/day the write volume is trivial and every run yields a fresh `latestClose`; the skip machinery `stock_price_sync` needs is omitted. |

## Open Questions / TODOs

| # | Question |
|---|---|
| 1 | **Adjusted vs unadjusted close.** Confirm `historical-price-eod/light` (with `nonadjusted` omitted) returns split/dividend-**adjusted** closes, so a split between Jan 1 and today does not distort the YTD %. If it returns unadjusted, decide whether to pass `nonadjusted=false` explicitly or adjust in code. |
| 2 | **`ytdChangePercent` units** are a percentage number (`12.34` = +12.34%), not a fraction or basis points — confirm the front end expects this. |
| 3 | **Current-year listings.** Confirmed the watchlist does not carry tickers that first listed in the current year, so skipping any ticker with no prior-year close is safe. Revisit the baseline rule deliberately if that ever changes. |
| 4 | **Stale documents.** A ticker removed from the watchlist keeps its `ytd_price_change/{ticker}` doc (no longer updated, not deleted). Decide whether a cleanup pass is needed (out of scope v1). |
| 5 | **Front-end read fit.** Confirm reads of `ytd_price_change/{ticker}` fit the security rules (read-only to authenticated clients, writes denied). |
| 6 | **Manual harness.** Add `_manual_harness.ts` + a `package.json` script (`ts-node --transpile-only`) so a run is exercisable locally as `npm run <name> -- --project <dev\|qa\|prod>`, per project convention. |
