# Data Models

Defined in `models/` — one interface per file. Services, tests, and the use case import each type from its exact file (e.g. `../models/PriceSnapshot`); there is no barrel `index.ts`, per the project TypeScript standard.

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

interface DailyClose {
  date: string;      // "YYYY-MM-DD" (ET) — one record per trading day (closed days absent)
  close: number;     // official (unadjusted) end-of-day close; the FMP EOD DTO's `price`
}

interface PricePoint {
  t: string;         // "HH:mm" ET of the bucket's newest bar — sessionDate supplies the date
  c: number;         // that bar's close
}

interface PriceSnapshot {
  ticker: string;                 // uppercase
  companyName: string;
  price: number;                  // intraday: close of the newest 1-min bar; after finalize: official EOD close
  previousClose: number | null;   // prior session's official EOD close (daily EOD fetch)
  change: number | null;          // price − previousClose
  changePercent: number | null;   // change / previousClose × 100
  sessionDate: string;            // "YYYY-MM-DD" (ET) — always the current session at write time
  series: PricePoint[];           // current session, downsampled to seriesBucketMinutes buckets (+ a 16:00 close point after finalize)
  latestBarAt: string;            // "YYYY-MM-DD HH:mm:ss" of the newest 1-min bar — intraday unchanged-skip key
  closeFinalized: boolean;        // true once the official EOD close has replaced the last-trade price
}
```

`date` strings are compared lexicographically everywhere (the FMP formats sort correctly); nothing is parsed to `Date` except the phase gate and window-date computation, done in `America/New_York` like `stock_news_notifier`.

**Two price sources, by design.** During the session `price` is the newest 1-min bar's close (live, minute-fresh) and `closeFinalized` is `false`. After the post-close finalize (~4:20pm ET), `price` is overwritten with the **official EOD auction close**, a synthetic `{ t: "16:00", c: officialClose }` point is appended so the series tip still equals `price`, and `closeFinalized` flips to `true`. The 15:59 1-min bar close is a last-trade price and misses the closing auction — see [fmp-eod-service.md](fmp-eod-service.md) and [design-decisions.md](design-decisions.md).

**Change vs previous close.** `change`/`changePercent` measure the day's move against the **prior session's official EOD close** (`previousClose`), sourced by a once-per-ticker-per-day EOD windowed fetch ([fmp-eod-service.md](fmp-eod-service.md)) — the exact auction close, no cent-level skew. Both are `null` when `previousClose` is unavailable (`null` or `0`).

**Series downsampling.** `series` is not the raw 1-min bars: bars are grouped into `seriesBucketMinutes` buckets (default 5 — floor of minutes-since-midnight ÷ bucket size) and each bucket contributes one point, the **newest bar in the bucket** (`t` = that bar's `"HH:mm"`, `c` = its close). The in-progress bucket is included, so the intraday series tip always equals `price`. The finalize step appends one `{ t: "16:00", c: officialClose }` point. At 5-min buckets a full session is ~79 points (~2 KB) — visually identical on a mini sparkline. `price`/`latestBarAt` always come from the newest raw 1-min bar intraday, so the row number stays minute-fresh regardless of bucket size.

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

`StoredStockPrice` — `PriceSnapshot` plus `updatedAt`. Written with a full-overwrite `set()` (never `update`/merge), intraday **and** on finalize: the document is a pure projection of the latest fetch, so replacing it wholesale is what makes every run idempotent. **`series` only ever contains the current session's bars** (plus the 16:00 close point after finalize). One document per ticker, bounded by watchlist size — no TTL, no cleanup function.

```
ticker:         string          // duplicated from doc ID for client convenience
companyName:    string
price:          number          // intraday last trade, or official close once closeFinalized
previousClose:  number | null   // prior session's official EOD close
change:         number | null   // price − previousClose
changePercent:  number | null   // change / previousClose × 100
sessionDate:    string          // "YYYY-MM-DD" (ET)
series:         PricePoint[]    // ~79 × {t, c} at 5-min buckets ≈ 2 KB — far below the 1 MiB doc limit
latestBarAt:    string          // "YYYY-MM-DD HH:mm:ss" (ET) of the newest 1-min bar
closeFinalized: boolean         // official EOD close applied
updatedAt:      Timestamp       // server timestamp
```

**Front-end read pattern.** One-time fetches, triggered when the user views the home tab or pulls to refresh — **no continuous listeners**. Direct document reads, no queries, no composite indexes (`firestore.indexes.json` untouched):

```typescript
db.collection('stock_prices').doc(ticker).get()   // one get per watched ticker per refresh
```

The sparkline renders `series` as-is — the downsampling already happened server-side. Outside market hours the document holds the last completed session with `closeFinalized = true`, so the front end renders the **official close** for the latest available session — `sessionDate` identifies it.
