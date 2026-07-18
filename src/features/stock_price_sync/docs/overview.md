# Stock Price Sync

## Purpose

Every minute during US market hours (gated in code to 9:30am–4:05pm ET, weekdays), fetches the current-session 1-minute price series for every ticker on the global watchlist from FMP and writes one compact snapshot document per ticker to Firestore — latest price, day change vs previous close, and the intraday sparkline series for **the current session only**. Around the session it runs two short EOD passes: a **pre-open seed** that establishes each ticker's `previousClose` from the prior session's **official closing-auction price**, and a **post-close finalize** that overwrites the day's `price` with the official close (the 1-minute feed's last bar is 15:59 and misses the 16:00 auction — see [design-decisions.md](price_ingestion/design-decisions.md)). The front end renders each user's watchlist rows (price, mini chart) with one-time document fetches when the user views the home tab or pulls to refresh, always showing the latest available session.

Every write is a **stateless full-session snapshot refresh**: each write fully replaces the previous one, so a failed run, a crashed function, or an FMP outage is completely healed by the next run. There is no cursor, no queue, and no retry infrastructure — the schedule *is* the retry (see [design-decisions.md](price_ingestion/design-decisions.md) for why the original Pub/Sub fan-out plan was rejected). The only server state is two in-memory per-instance caches (`previousClose`, `latestBarAt`) plus a finalize marker, all rebuilt harmlessly on cold start.

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [price_ingestion](price_ingestion/overview.md) | Cloud Scheduler `* 9-16 * * 1-5` ET, gated in code into three phases | Pre-open EOD `previousClose` seed · per-ticker intraday 1-min fetch + snapshot derivation (price, change %, sparkline) · post-close EOD finalize of the official close · idempotent full-overwrite Firestore write with unchanged-skip |

---

## High-Level Architecture

```
Cloud Scheduler (every minute, Mon–Fri, gated in code by ET phase)
         │
         ▼
stockPriceSync  [trigger.ts]
         │
         ▼
StockPriceSyncUseCase  [usecase.ts]  — phase gate: pre-open seed | intraday | post-close finalize
   ├── reads  watchlist/{ticker}                   (written by watchlist_aggregator, cached per instance)
   ├── reads  FMP /historical-price-eod/light      (official close → previousClose seed + post-close finalize)
   ├── reads  FMP /historical-chart/1min           (1 call/ticker; today-only intraday series + last price)
   └── writes stock_prices/{ticker}                (current-session snapshot overwrite, skip-if-unchanged)
                    │
                    ▼
          Front end (one-time get() on home-tab view / pull-to-refresh) — watchlist rows: price · Δ% · mini chart
```

---

## Shared Data Model — `StoredStockPrice`

Written to `stock_prices/{ticker}`. The front end does a **one-time fetch** of each watched ticker's document when the user views the home tab or pulls to refresh — no continuous listeners, direct document reads, no queries, no composite indexes — and renders the row and sparkline from this single document.

| Field | Type | Description |
|---|---|---|
| `ticker` | string | Uppercase ticker — also the document ID |
| `companyName` | string | From the watchlist entry |
| `price` | number | Intraday: close of the newest 1-min bar. After finalize: the **official EOD close** |
| `previousClose` | number \| null | Prior trading session's **official EOD close** (null if not derivable) |
| `change` | number \| null | `price − previousClose` |
| `changePercent` | number \| null | `change / previousClose × 100` |
| `sessionDate` | string | `"YYYY-MM-DD"` (ET) of the session the series covers |
| `series` | `{t, c}[]` | Chronological intraday points for the current session only, downsampled server-side to 5-min buckets (newest bar per bucket) — `t` = `"HH:mm"` (ET), `c` = close. ~79 points; a `16:00` official-close point is appended on finalize |
| `latestBarAt` | string | `"YYYY-MM-DD HH:mm:ss"` (ET) of the newest 1-min bar — the intraday unchanged-skip key |
| `closeFinalized` | boolean | `true` once the official EOD close has replaced the last-trade price |
| `updatedAt` | Timestamp | Server timestamp at write |

`change`/`changePercent` measure the day's move against the **prior trading session's official closing-auction price** — the exact close, sourced once per ticker per day from the EOD endpoint. During the session `price` is minute-fresh from the 1-min feed with `closeFinalized = false`; after ~4:20pm ET `price` is the official close with `closeFinalized = true`. Outside market hours nothing new is written, so the document retains the last completed (finalized) session and the front end renders the latest available data — `sessionDate` identifies the session.
