# fmp_eod_service.ts

Fetches the current year's daily closes for one ticker from the FMP **EOD-light** endpoint and parses them into `EodClose[]`. A thin endpoint config over [fmp_client.ts](fmp-client.md) — identical endpoint and parsing to [stock_price_sync/services/fmp_eod_service.ts](../../../stock_price_sync/services/fmp_eod_service.ts), only the window is wider (full year vs a few days).

[← back to overview](overview.md)

---

## Endpoint

| Aspect | Value |
|---|---|
| Path | `/historical-price-eod/light` |
| Base URL | `getRemoteConfig().fmp.baseUrl` = `https://financialmodelingprep.com/stable` |
| Example | `…/stable/historical-price-eod/light?symbol=AAPL&from=2025-12-17&to=2026-07-21&apikey=…` |
| Auth | `apikey` query param (from the `FMP_API_KEY` secret) |
| `nonadjusted` | omitted → **false** → split/dividend-adjusted closes (see open question in [tech-stack.md](tech-stack.md#open-questions--todos)) |

## Query params

| Param | Source |
|---|---|
| `symbol` | ticker (URL-encoded) |
| `from` | `subtractCalendarDays(`${year}-01-01`, cfg.baselineLookbackCalendarDays)` (default 15 → mid-Dec prior year) |
| `to` | `today` (`todayEasternDate`) |
| `apikey` | `FMP_API_KEY` |

## `fetchDailyCloses(ticker, window): Promise<EodClose[]>`

1. Delegates to `client.fetchWindowedRows(FMP_EOD_ENDPOINT, ticker, window)` with the `EOD` endpoint descriptor (path + `parseRow`).
2. **Row parsing** (`parseEodClose`): accepts a row only if `date` is a non-empty string and `price` is a finite number; maps to `{ date, close: price }`. Invalid rows are dropped and counted in a single info log — a few malformed rows never fail the call.
3. Returns the array as returned by FMP; the use case does not assume order — it scans for min/max dates explicitly.

## Response handling & errors

Delegated entirely to the shared client ([fmp-client.md](fmp-client.md)): non-2xx → `AppError('FMP_EOD_FETCH_FAILED', status)` (transient statuses retried); non-array body → `AppError('FMP_EOD_INVALID_RESPONSE', 422)` (permanent); 10 s per-attempt timeout. The endpoint returns one record per trading day (closed days absent) and **includes today's row during the session** — the source of `latestClose`.
