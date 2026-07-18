# fmp_eod_service.ts

Fetches the **official end-of-day close** for a single ticker from the FMP stable EOD (light) endpoint. This is the authoritative source for both `previousClose` (prior session's official close) and the finalized close of the current session — the values the 1-minute chart endpoint **cannot** provide (see below and [design-decisions.md](design-decisions.md)).

**Thin endpoint wrapper.** Like `FmpChartService`, `FmpEodService` holds no HTTP/retry logic — it constructs a shared [`FmpClient`](fmp-client.md) and declares one `FmpEndpoint<DailyClose>` config (`path`, `label: 'EOD'`, error codes, and the `parseEodClose` row parser). Kept as a **separate service** from the chart service because it is a different endpoint, a different DTO, and a different validation boundary (daily records, not intraday bars) — but both share the client's fetch/retry/timeout machinery.

[← back to overview](overview.md)

---

## Why the EOD endpoint is required

The `historical-chart/1min` endpoint's last regular-session bar is timestamped **15:59** (it covers trades 15:59:00–15:59:59). There is no 16:00 bar — the session ends at 16:00 and the **closing auction / cross** prints separately. The last 1-min bar close is therefore a *last-trade* price, not the **official consolidated/auction close**, and the two routinely differ (the closing cross concentrates large volume at a single price). Deriving `price` at/after the close, or `previousClose`, from a 1-min bar bakes in that auction delta on every ticker, every day. The EOD light endpoint carries the auction close and is the only accessible source for it on the current plan.

---

## API

| Item | Value |
|---|---|
| Base URL | `getRemoteConfig().fmp.baseUrl` → `https://financialmodelingprep.com/stable` |
| Endpoint | `GET {baseUrl}/historical-price-eod/light` |
| Params | `symbol` (one ticker — no batch/bulk EOD on the current plan, confirmed), `from` / `to` (date `YYYY-MM-DD`, inclusive), `apikey` |
| Auth | `apikey` query param — `FMP_API_KEY` from Secret Manager, injected via `defineSecret` |
| Response | JSON array of daily records, newest first: `{ symbol, date, price, volume }` — `price` is the **official (unadjusted) close**, `date` is `"YYYY-MM-DD"` (ET). **~15-minute delayed**: today's record does not appear until ~16:15 ET. Closed days (weekends, holidays, ad-hoc closures) simply have **no record** |

> There is **no bulk/batch EOD endpoint** on the current FMP plan (confirmed), so this stays single-symbol — the same per-ticker fan-out the whole feature already uses. Cost is negligible: at most **2 EOD calls per ticker per day** (one seed, one finalize), each a ~small daily-record payload.

**One windowed fetch answers both questions.** Because EOD is daily-grained, a single call over `[today − lookback, today]` yields, in one response:
- **`previousClose`** — the `price` of the newest record with `date < today` (the last session before today).
- **today's official close** — the `price` of the record with `date === today`, present only after the ~15-min delay.

Closed days need no calendar logic: they are absent from the response, so "the newest record before today" is always the correct prior session. A **narrow window + widen-on-miss** mirrors the pattern proven in the intraday seed (now removed from the chart service):

| Mode | Window | When | Rationale |
|---|---|---|---|
| **Narrow** | `from = today − eodLookbackCalendarDays` (default 4), `to = today` | Every EOD fetch (seed and finalize) | 4 calendar days always spans a long weekend and reaches the prior session in one call |
| **Widened fallback** | `from = today − eodFallbackCalendarDays` (default 10), `to = today` | The narrow response contains **no record with `date < today`** (a multi-day holiday cluster, e.g. Thanksgiving or Christmas/New-Year) | The market data itself is the calendar — one extra call on the ~handful of long-cluster mornings a year; zero holiday-calendar dependency |

Retry/timeout/error handling is inherited from [fmp-client.md](fmp-client.md): 3 attempts (1s → 2s → throw) on transient statuses (429/500/502/503/504) and network errors, a 10s per-request timeout, `AppError("FMP EOD fetch failed for {ticker}: {statusText}", 'FMP_EOD_FETCH_FAILED', status)` on non-`ok`, and `AppError(..., 'FMP_EOD_INVALID_RESPONSE', 422)` on a non-array body. Treating a non-array as empty would silently drop the authoritative close while masking an FMP contract change.

---

## Endpoint config & function

`FMP_EOD_ENDPOINT: FmpEndpoint<DailyClose>` — `{ path: '/historical-price-eod/light', label: 'EOD', fetchFailedCode: 'FMP_EOD_FETCH_FAILED', invalidResponseCode: 'FMP_EOD_INVALID_RESPONSE', parseRow: parseEodClose }`.

### `fetchDailyCloses(ticker: string, window: { from: string; to: string }): Promise<DailyClose[]>`

Delegates to `FmpClient.fetchWindowedRows(FMP_EOD_ENDPOINT, ticker, window)`. Window dates are computed by the [PreviousCloseResolver](usecase.md) in `America/New_York`.

`parseEodClose` (the row parser) validates at the boundary: rows that are not objects, or whose `date` is missing/not a string, or whose `price` is missing/not a finite number, are dropped (the client counts them in a single info log per ticker). Only `date` and `price` are load-bearing; the DTO's `price` maps to the domain `close`. Returns the raw (unsorted) validated `DailyClose[]` — selecting the prior-session close and today's close belongs to the resolver.

An empty array is a valid result (a brand-new listing, or a fetch before any EOD exists) — the resolver treats `previousClose` / today's close as absent and proceeds. `DailyClose` is defined in [data-models.md](data-models.md).
