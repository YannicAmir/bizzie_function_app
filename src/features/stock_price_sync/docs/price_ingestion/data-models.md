# Data Models

Defined in `models/` — one interface per file, re-exported through `models/index.ts`. Services and the use case import from `../models`.

[← back to overview](overview.md)

---

## Domain Types

```typescript
interface IntradayBar {
  date: string;      // "YYYY-MM-DD HH:mm:ss" — US/Eastern, lexicographically sortable
  open: number;
  low: number;
  high: number;
  close: number;
  volume: number;
}

interface PricePoint {
  t: string;         // "HH:mm" ET of the bucket's newest bar — sessionDate supplies the date
  c: number;         // that bar's close
}

interface PriceSnapshot {
  ticker: string;                 // uppercase
  companyName: string;
  price: number;                  // close of the newest 1-min bar of the current session
  previousClose: number | null;   // final bar close of the prior trading session (daily seed fetch)
  change: number | null;          // price − previousClose
  changePercent: number | null;   // change / previousClose × 100
  sessionDate: string;            // "YYYY-MM-DD" (ET) — always the current session at write time
  series: PricePoint[];           // current session, downsampled to seriesBucketMinutes buckets (~79 points at 5 min)
  latestBarAt: string;            // "YYYY-MM-DD HH:mm:ss" of the newest 1-min bar — unchanged-skip key
}
```

`date` strings are compared lexicographically everywhere (the FMP format sorts correctly); nothing is parsed to `Date` except the market-window gate and window-date computation, done in `America/New_York` like `stock_news_notifier`.

**Change vs previous close.** `change`/`changePercent` measure the day's move against the **prior trading session's final 1-min bar close**, sourced by a once-per-ticker-per-day lookback seed fetch ([fmp-chart-service.md](fmp-chart-service.md)) — the standard broker-row semantics. Both are `null` when `previousClose` is unavailable (`null` or `0`). Caveat: the prior session's final 1-min bar can differ from the official consolidated close by a cent or two — acceptable for a watchlist row.

**Series downsampling.** `series` is not the raw 1-min bars: bars are grouped into `seriesBucketMinutes` buckets (default 5 — floor of minutes-since-midnight ÷ bucket size) and each bucket contributes one point, the **newest bar in the bucket** (`t` = that bar's `"HH:mm"`, `c` = its close). The in-progress bucket is included, so the series tip always equals `price`. At 5-min buckets a full session is ~79 points (~2 KB doc vs ~10 KB raw) — visually identical on a mini sparkline, which has fewer horizontal pixels than 79 points anyway. `price`/`latestBarAt` always come from the newest raw 1-min bar, so the row number stays minute-fresh regardless of bucket size.

---

## Firestore Document Schemas

### `watchlist/{ticker}` — read by this pipeline

Written by `watchlist_aggregator`. Read via the core `FirebaseWatchlistService`.

```
ticker:      string       // doc ID, e.g. "AAPL"
companyName: string
lastAddedAt: Timestamp
```

### `stock_prices/{ticker}` — written by this pipeline

`StoredStockPrice` — `PriceSnapshot` plus `updatedAt`. Written with a full-overwrite `set()` (never `update`/merge): the document is a pure projection of the latest FMP fetch, so replacing it wholesale is what makes every run idempotent. **`series` only ever contains the current session's bars.** One document per ticker, bounded by watchlist size — no TTL, no cleanup function.

```
ticker:         string          // duplicated from doc ID for client convenience
companyName:    string
price:          number
previousClose:  number | null   // prior session's final bar close
change:         number | null   // price − previousClose
changePercent:  number | null   // change / previousClose × 100
sessionDate:    string          // "YYYY-MM-DD" (ET)
series:         PricePoint[]    // ~79 × {t, c} at 5-min buckets ≈ 2 KB — far below the 1 MiB doc limit
latestBarAt:    string          // "YYYY-MM-DD HH:mm:ss" (ET)
updatedAt:      Timestamp       // server timestamp
```

**Front-end read pattern.** One-time fetches, triggered when the user views the home tab or pulls to refresh — **no continuous listeners** (a deliberate cost decision: read volume scales with user activity, not with market-hours write volume). Direct document reads, no queries, no composite indexes (`firestore.indexes.json` untouched):

```typescript
db.collection('stock_prices').doc(ticker).get()   // one get per watched ticker per refresh
```

The sparkline renders `series` as-is — the downsampling already happened server-side. (A future full-resolution stock-detail chart would fetch FMP separately or lower `seriesBucketMinutes`; this doc serves the watchlist row.) Outside market hours the document holds the last completed session and the front end simply renders the latest available data — `sessionDate` identifies the session.
