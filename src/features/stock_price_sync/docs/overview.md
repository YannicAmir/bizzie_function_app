# Stock Price Sync

## Purpose

Every minute during US market hours (gated to 9:30am–4:05pm ET, weekdays — bars are near-real-time, and the 4:05 final run captures the complete session including the close), fetches the current-session 1-minute price series for every ticker on the global watchlist from FMP and writes one compact snapshot document per ticker to Firestore — latest price, day change vs previous close, and the intraday sparkline series for **the current session only**. The front end renders each user's watchlist rows (price, mini chart) with one-time document fetches when the user views the home tab or pulls to refresh, always showing the latest available session.

Every run is a **stateless full-session snapshot refresh**: each write fully replaces the previous one, so a failed run, a crashed function, or an FMP outage is completely healed by the next minute's run. There is no cursor, no queue, and no retry infrastructure — the schedule *is* the retry (see [design-decisions.md](price_ingestion/design-decisions.md) for why the original Pub/Sub fan-out plan was rejected).

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [price_ingestion](price_ingestion/overview.md) | Cloud Scheduler `* 9-16 * * 1-5` ET, gated in code to 9:30am–4:05pm | Per-ticker FMP 1-min chart fetch (today-only window + daily prevClose seed, bounded concurrency) · snapshot derivation (price, change %, sparkline) · idempotent full-overwrite Firestore write with unchanged-skip |

---

## High-Level Architecture

```
Cloud Scheduler (every minute, gated 9:30am–4:05pm ET, Mon–Fri)
         │
         ▼
stockPriceSync  [trigger.ts]
         │
         ▼
StockPriceSyncUseCase  [usecase.ts]
   ├── reads  watchlist/{ticker}                 (written by watchlist_aggregator, cached per instance)
   ├── reads  FMP /historical-chart/1min         (1 call per ticker; today-only window, daily seed for prevClose)
   └── writes stock_prices/{ticker}              (current-session snapshot overwrite, skip-if-unchanged)
                    │
                    ▼
          Front end (one-time get() on home-tab view / pull-to-refresh) — watchlist rows: price · Δ% · mini chart
```

---

## Shared Data Model — `StoredStockPrice`

Written to `stock_prices/{ticker}`. The front end does a **one-time fetch** of each watched ticker's document when the user views the home tab or pulls to refresh — no continuous listeners, direct document reads, no queries, no composite indexes — and renders the row and sparkline from this single document. Data is near-real-time at write (≤ ~60s poll staleness; the 1-min chart endpoint is not subject to the plan's 15-min quote delay) and as fresh as the user's last refresh on screen.

| Field | Type | Description |
|---|---|---|
| `ticker` | string | Uppercase ticker — also the document ID |
| `companyName` | string | From the watchlist entry |
| `price` | number | Close of the newest 1-min bar of the current session |
| `previousClose` | number \| null | Final 1-min bar close of the prior trading session (null if not derivable) |
| `change` | number \| null | `price − previousClose` |
| `changePercent` | number \| null | `change / previousClose × 100` |
| `sessionDate` | string | `"YYYY-MM-DD"` (ET) of the session the series covers |
| `series` | `{t, c}[]` | Chronological intraday points for the current session only, downsampled server-side to 5-min buckets (newest bar per bucket) — `t` = `"HH:mm"` (ET), `c` = close. ~79 points (~2 KB) |
| `latestBarAt` | string | `"YYYY-MM-DD HH:mm:ss"` (ET) of the newest bar — the unchanged-skip key |
| `updatedAt` | Timestamp | Server timestamp at write |

`change`/`changePercent` measure the day's move against the prior trading session's final 1-min bar close (≈ official close ± a cent or two), sourced by a once-per-ticker-per-day seed fetch. Outside market hours nothing new is written, so the document retains the last completed session and the front end simply renders the latest available data — `sessionDate` identifies the session.
