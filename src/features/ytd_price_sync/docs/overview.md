# YTD Price Sync

## Purpose

Every 10 minutes, every day, fetches the current year's daily-close series for every ticker on the global watchlist from FMP and writes one compact snapshot document per ticker to Firestore — the **year-to-date price change**: the baseline (prior-year final close), the latest available close, and the resulting absolute (`$`) and percentage move. The front end renders each user's watchlist rows with a YTD figure via one-time document fetches when the user views the relevant tab or pulls to refresh, always showing the latest computed value. Structurally this is [stock_price_sync](../../stock_price_sync/docs/overview.md)'s smaller sibling — same global watchlist source, the same FMP EOD-light endpoint, the same per-ticker bounded concurrency and shared `fmp_client` transport — but it derives one YTD scalar per ticker instead of an intraday sparkline, so it drops that feature's phase gate, cohort sharding, and previous-close warm cache (see [design-decisions.md](ytd_computation/design-decisions.md)).

Every write is a **stateless full recompute**: each run re-fetches the *entire* year window per ticker and *fully overwrites* the document, so a failed ticker, a crashed function, or an FMP outage is completely healed by the next scheduled run — there is no cursor, no queue, no lease, and no retry infrastructure. The schedule *is* the retry. The only server state is a per-instance watchlist cache, rebuilt harmlessly on cold start.

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [ytd_computation](ytd_computation/overview.md) | Cloud Scheduler `*/10 * * * *` (every 10 min) | Per ticker: one EOD-light fetch (mid-Dec of prior year → today) · derive baseline (prior-year final close) + latest close · compute absolute & % change · idempotent full-overwrite write to `ytd_price_change/{ticker}` |

---

## High-Level Architecture

```
Cloud Scheduler (*/10 * * * *, every 10 min, all days)
         │
         ▼
ytdPriceSync  [trigger.ts]  — pause/resume via the Cloud Scheduler job in the GCP console
         │
         ▼
YtdPriceSyncUseCase.execute()  [usecase.ts]  — load → per-ticker fetch/derive/write → summary
   ├── reads  watchlist/{ticker}                   (core WatchlistService, cached per instance)
   ├── reads  FMP /historical-price-eod/light      (1 call/ticker; from = mid-Dec prior year, to = today)
   ├── derives baseline + latest close             [snapshot.ts]  buildYtdSnapshot (pure)
   └── writes ytd_price_change/{ticker}            (full-overwrite set())
                    │
                    ▼
          Front end (one-time get() on watchlist view / pull-to-refresh) — YTD $ + Δ% per row
```

---

## Shared Data Model — `StoredYtdChange`

Written to `ytd_price_change/{ticker}`. The front end does a **one-time fetch** of each watched ticker's document — no continuous listeners, no queries, no composite indexes — and renders the YTD figure from this single document. See [ytd_computation/data-models.md](ytd_computation/data-models.md) for the interfaces.

| Field | Type | Description |
|---|---|---|
| `ticker` | string | Uppercase ticker — also the document ID |
| `companyName` | string | From the watchlist entry |
| `year` | number | Eastern-time calendar year the YTD covers, e.g. `2026` |
| `baselineDate` | string | `"YYYY-MM-DD"` (ET) of the prior-year final close (the YTD baseline) |
| `baselineClose` | number | Baseline price — the denominator of the % change |
| `latestDate` | string | `"YYYY-MM-DD"` (ET) of the most recent close in the series |
| `latestClose` | number | Most recent available close — the "current" value (includes today's ~15-min-delayed row intraday) |
| `ytdChange` | number | `latestClose − baselineClose` (absolute, currency) |
| `ytdChangePercent` | number | `ytdChange / baselineClose × 100`, e.g. `12.34` = +12.34% |
| `updatedAt` | Timestamp | Server timestamp at write |

The baseline is the **prior trading year's official final close** — the newest EOD record with `date < Jan 1` of `year` — or, for a ticker that first listed in the current year, the **first available close of the current year** (its first session). This fallback means mid-year watchlist additions are backed by a document of the same shape rather than skipped, so the front end renders every watchlisted company consistently. A ticker is skipped only when it has no usable close at all (empty series or a zero baseline). `latestClose` is the newest record in the same response; the EOD-light endpoint includes today's row during the session (verified 2026-07-21), so runs during the session update it. Outside market hours the series is unchanged, so those runs rewrite the same value (harmless — each write is an idempotent full recompute).
