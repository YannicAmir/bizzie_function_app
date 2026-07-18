# fmp_chart_service.ts

Fetches the current session's 1-minute chart for a single ticker from the FMP stable API — the source for the intraday **series** and the intraday **last price**. It does **not** source `previousClose` or the official close: the 1-min endpoint's final bar is 15:59 (a last-trade price that misses the 16:00 auction), so those come from the EOD endpoint ([fmp-eod-service.md](fmp-eod-service.md)).

**Thin endpoint wrapper.** `FmpChartService` holds no HTTP/retry logic of its own — it constructs a shared [`FmpClient`](fmp-client.md) with the API key and declares one `FmpEndpoint<IntradayBar>` config (`path`, `label: 'intraday'`, error codes, and the `parseFmpBar` row parser). `fetchIntradayBars` is a one-line delegation to `FmpClient.fetchWindowedRows`. The URL construction, 10s timeout, `retry()` wrapping, and transient-status policy all live in the client — see [fmp-client.md](fmp-client.md).

[← back to overview](overview.md)

---

## API

| Item | Value |
|---|---|
| Base URL | `getRemoteConfig().fmp.baseUrl` → `https://financialmodelingprep.com/stable` |
| Endpoint | `GET {baseUrl}/historical-chart/1min` |
| Params | `symbol` (one ticker — the endpoint does not accept multiple), `from` / `to` (date `YYYY-MM-DD`, inclusive), `apikey` |
| Auth | `apikey` query param — `FMP_API_KEY` from Secret Manager, injected via `defineSecret` |
| Response | JSON array of bars, newest first: `{ date, open, low, high, close, volume }` — near-real-time (verified: no 15-min delay on this endpoint); regular session only (no extended hours). **Last bar of the day is 15:59** — see below |

> The 1-min endpoint's last regular-session bar is **15:59** (trades 15:59:00–15:59:59); there is no 16:00 bar because the closing auction prints separately. Its close is a *last-trade* price, **not** the official close — the official close comes from [fmp-eod-service.md](fmp-eod-service.md). The FMP **quote** endpoints (including `batch-quote`) are **not available on the current FMP plan** — confirmed 2026-07-16.

**Single fetch mode — today-only.** The use case always calls this with `from = to = today` (ET). This is what keeps the feature at ~18% of the plan's 500 GB / rolling-30-day bandwidth cap (a multi-day window every minute would total ~570 GB/30d and exceed it — see [tech-stack.md](tech-stack.md)):

| Mode | Window | Payload |
|---|---|---|
| **Today-only** (every call) | `from = to = today` (ET) | 0→43 KB, growing through the day |

The post-close finalize phase re-uses this same today-only fetch to read the now-frozen session series before overwriting `price` with the official close ([usecase.md](usecase.md)). The former 1-min *previous-close seed* (multi-day lookback, weekday-aware narrow window, widen-on-miss) is **removed** — `previousClose` is now sourced from the EOD endpoint, which is both more accurate and simpler.

Retry/timeout/error handling is inherited from [fmp-client.md](fmp-client.md): 3 attempts (1s → 2s → throw) on transient statuses (429/500/502/503/504) and network errors, a 10s per-request timeout, `AppError("FMP intraday fetch failed for {ticker}: {statusText}", 'FMP_FETCH_FAILED', status)` on non-`ok`, and `AppError(..., 'FMP_INVALID_RESPONSE', 422)` on a non-array body (a malformed-JSON `SyntaxError` is **not** retried).

---

## Endpoint config & function

`FMP_CHART_ENDPOINT: FmpEndpoint<IntradayBar>` — `{ path: '/historical-chart/1min', label: 'intraday', fetchFailedCode: 'FMP_FETCH_FAILED', invalidResponseCode: 'FMP_INVALID_RESPONSE', parseRow: parseFmpBar }`.

### `fetchIntradayBars(ticker: string, window: { from: string; to: string }): Promise<IntradayBar[]>`

Delegates to `FmpClient.fetchWindowedRows(FMP_CHART_ENDPOINT, ticker, window)`. Window dates are computed by the use case in `America/New_York`.

`parseFmpBar` (the row parser) validates at the boundary: rows that are not objects, or whose `date` is missing/not a string, or whose `close` is missing/not a finite number, are dropped (the client counts them in a single info log per ticker). `open`/`low`/`high`/`volume` default to `close`/`0` when absent — only `date` and `close` are load-bearing. Returns the raw (unsorted) validated bars — sorting, session filtering, and snapshot derivation belong to the use case.

An empty array is a valid result (holidays, new listings, FMP data gaps) — the use case skips the ticker without error.
