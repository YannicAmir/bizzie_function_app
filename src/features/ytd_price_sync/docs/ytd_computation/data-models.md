# Data Models

Defined in `models/` — one interface per file, imported from its exact path (e.g. `../models/YtdChangeSnapshot`); no barrel `index.ts`, per the project TypeScript standard.

[← back to overview](overview.md)

---

## Domain Types

```typescript
interface EodClose {
  date: string;   // "YYYY-MM-DD" (ET) — one record per trading day (closed days absent)
  close: number;  // end-of-day close; the FMP EOD-light DTO's `price`
}

interface YtdChangeSnapshot {
  ticker: string;          // uppercase — also the doc ID
  companyName: string;
  year: number;            // Eastern-time calendar year the YTD covers, e.g. 2026
  baselineDate: string;    // "YYYY-MM-DD" of the prior-year final close
  baselineClose: number;   // denominator of the % change
  latestDate: string;      // "YYYY-MM-DD" of the newest close in the series
  latestClose: number;     // the "current" value (includes today's row intraday)
  ytdChange: number;       // latestClose − baselineClose (currency)
  ytdChangePercent: number;// ytdChange / baselineClose × 100
}

interface StoredYtdChange extends YtdChangeSnapshot {
  updatedAt: Timestamp;    // firebase-admin server timestamp at write
}
```

`date` strings sort lexicographically (the FMP format sorts correctly); nothing is parsed to `Date` except the window-date computation, done in `America/New_York` via `core/date_utils`.

**Baseline = prior-year final close.** The baseline is always the **prior trading year's final close** — the newest `EodClose` with `date < `${year}-01-01``. Widening the fetch window to mid-December (`baselineLookbackCalendarDays`) guarantees that record is present for any ticker that traded last year. A ticker with *no* prior-year record (i.e. one that first listed in the current year) yields no baseline, so `buildYtdSnapshot` returns `null` and the ticker is **skipped** (no document written) — a defensive path, since the watchlist does not carry current-year listings. See [design-decisions.md](design-decisions.md#baseline--prior-year-final-close).

**Latest / "current".** `latestClose` is the newest record in the same response. The EOD-light endpoint returns today's row during the session (~15-min delayed on the Enterprise plan; verified 2026-07-21), so every one of the four daily runs advances `latestClose`/`latestDate` — no separate intraday source is needed ([fmp-eod-service.md](fmp-eod-service.md)).

---

## Firestore Document Schemas

### `watchlist/{ticker}` — read by this pipeline

Written elsewhere; read via the core `FirebaseWatchlistService` (`getAllWatchedTickers` → `Map<ticker, companyName>`). This feature never writes it.

```
ticker:      string       // doc ID, e.g. "AAPL"
companyName: string       // or `name`; falls back to the ticker
```

### `ytd_price_change/{ticker}` — written by this pipeline

`StoredYtdChange` — `YtdChangeSnapshot` plus `updatedAt`. Written with a full-overwrite `set()` (never `update`/merge): the document is a pure projection of the latest fetch, so replacing it wholesale is what makes every run idempotent. One document per ticker, bounded by watchlist size — no TTL, no cleanup function.

```
ticker:            string          // duplicated from doc ID for client convenience
companyName:       string
year:              number          // e.g. 2026
baselineDate:      string          // "YYYY-MM-DD" — prior-year final close date
baselineClose:     number
latestDate:        string          // "YYYY-MM-DD"
latestClose:       number
ytdChange:         number          // latestClose − baselineClose
ytdChangePercent:  number          // ytdChange / baselineClose × 100
updatedAt:         Timestamp       // server timestamp
```

**Front-end read pattern.** One-time fetches, triggered when the user views the watchlist or pulls to refresh — no continuous listeners, no queries, no composite indexes (`firestore.indexes.json` untouched):

```typescript
db.collection('ytd_price_change').doc(ticker).get()   // one get per watched ticker per refresh
```
