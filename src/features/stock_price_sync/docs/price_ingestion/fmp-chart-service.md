# fmp_chart_service.ts

Fetches the current session's 1-minute chart for a single ticker from the FMP stable API. Modeled on `fmp_news_service.ts` (`stock_news_notifier`): constructor takes the API key, base URL comes from Remote Config, every fetch is wrapped in `retry()`.

Imports: `retry` from `src/core/retry`, `getRemoteConfig` from `src/core/remote-config`, `Logger` from `src/core/logger` (`new Logger('StockPriceSync/FmpChartService')`).

[← back to overview](overview.md)

---

## API

| Item | Value |
|---|---|
| Base URL | `getRemoteConfig().fmp.baseUrl` → `https://financialmodelingprep.com/stable` |
| Endpoint | `GET {baseUrl}/historical-chart/1min` |
| Params | `symbol` (one ticker — the endpoint does not accept multiple), `from` / `to` (date `YYYY-MM-DD`, inclusive), `apikey` |
| Auth | `apikey` query param — `FMP_API_KEY` from Secret Manager, injected via `defineSecret` |
| Response | JSON array of bars, newest first: `{ date, open, low, high, close, volume }` — near-real-time (verified: no 15-min delay on this endpoint); regular session only (no extended hours) |

> The FMP **quote** endpoints (including `batch-quote`, which would collapse the whole run into ~1 call) are **not available on the current FMP plan** — confirmed 2026-07-16. This endpoint is the confirmed-accessible source; see [design-decisions.md](design-decisions.md) for the migration path if plan access changes.

**Two fetch modes.** The window is chosen per call by the use case; the today-only default is what keeps the feature at ~18% of the plan's 500 GB / rolling-30-day bandwidth cap (a multi-day window every minute would total ~570 GB/30d and exceed it — see [tech-stack.md](tech-stack.md)):

| Mode | Window | When | Payload |
|---|---|---|---|
| **Today-only** (the default, ~99% of calls) | `from = to = today` (ET) | `previousClose` for today's session is already cached | 0→43 KB, growing through the day |
| **Seed — narrow** | `from = today − 3` on Mondays (reaching Friday), `from = today − 1` Tue–Fri | First run of the day per ticker, cold instance, new ticker | ~45 KB, once per ticker per day (~25 MB/day total) |
| **Seed — widened fallback** | `from = today − seedFallbackCalendarDays` (default 6) | The narrow seed's response contains **no session before today** (yesterday was a market holiday or an ad-hoc closure) | ~130–250 KB, one extra call per ticker on ~9 post-holiday mornings/year |

The weekday rule handles the predictable calendar (weekends); the widen-on-miss fallback handles the unpredictable one — **the market data itself is the holiday calendar**. "No prior session in the response" is exactly what a closure looks like in the data, so the fallback is always correct, including for ad-hoc closures (e.g. presidential funerals) that no holiday package can predict. This is why the pipeline deliberately carries no holiday-calendar dependency ([design-decisions.md](design-decisions.md)). `previousClose` is thereby derivable from this one endpoint — no quote or EOD endpoint needed.

Retry config (per ticker fetch):

```typescript
retry(fetchBars, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
});   // 1s → 2s → throw
```

Non-`response.ok` throws `Error("FMP API Error: {status} {statusText}")` (retried). A non-array JSON body also throws and is retried — treating it as an empty response would silently skip the ticker while masking an FMP contract change.

---

## Functions

### `fetchIntradayBars(ticker: string, window: { from: string; to: string }): Promise<IntradayBar[]>`

1. Fetches the endpoint once with the given window (no pagination — the window is bounded). Window dates are computed by the use case in `America/New_York`.
2. Validates each row at the boundary (`parseFmpBar`): rows that are not objects, or whose `date` is missing/not a string, or whose `close` is missing/not a finite number, are dropped and counted in a single info log per ticker. `open`/`low`/`high`/`volume` default to `close`/`0` when absent — only `date` and `close` are load-bearing.
3. Returns the raw (unsorted) validated bars — sorting, session filtering, and `previousClose` derivation belong to the use case.

An empty array is a valid result (holidays, new listings, FMP data gaps) — the use case skips the ticker without error.
