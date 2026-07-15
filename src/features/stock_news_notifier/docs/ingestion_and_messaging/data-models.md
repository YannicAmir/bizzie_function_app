# Data Models

Defined in `models/` — one interface per file, re-exported through `models/index.ts`. Services and the use case import from `../models`.

[← back to overview](overview.md)

---

## Domain Types

```typescript
interface StockNewsArticle {
  symbol: string;          // uppercase ticker, e.g. "AREC"
  publishedDate: string;   // "YYYY-MM-DD HH:mm:ss" — US/Eastern, lexicographically sortable
  publisher: string;
  title: string;
  image: string | null;    // FMP may omit
  site: string;            // source domain, e.g. "proactiveinvestors.com"
  text: string;
  url: string;             // canonical article URL — part of the dedup key
}

interface FetchResult {
  articles: StockNewsArticle[];  // all pages merged, unfiltered
  pagesFetched: number;
  reachedOverlap: boolean;       // false → maxPages hit before overlapCutoff → backfill ran
  maxPublishedDate: string;      // newest publishedDate seen — next cursor value
}

interface IngestionCursor {
  lastPublishedDate: string;     // high-water mark, "YYYY-MM-DD HH:mm:ss"
  leaseExpiresAt: Timestamp;     // run lock; expired lease = no active run
  updatedAt: Timestamp;
}
```

`publishedDate` is compared as a plain string everywhere (the FMP format sorts lexicographically). It is parsed as `America/New_York` only when computing `overlapCutoff` and the first-run bootstrap watermark — never stored converted.

---

## Firestore Document Schemas

### `watchlist/{ticker}` — read by this pipeline

Written by `watchlist_aggregator`. Read via the core `FirebaseWatchlistService`.

```
ticker:      string       // doc ID, e.g. "AAPL"
companyName: string
lastAddedAt: Timestamp
```

### `stock_news/{newsId}` — written by this pipeline

`{newsId}` = `sha256("{symbol}|{url}")` — symbol is included because FMP can emit the same URL for multiple tickers. Written with `create()` (never `set`) — the failed `ALREADY_EXISTS` write **is** the dedup mechanism; no separate processed-items collection. A TTL policy on `expireAt` deletes documents ~72h after creation (see [ttl-setup.md](ttl-setup.md)).

```
newsId:        string      // duplicated from doc ID for client queries
symbol:        string
publishedDate: string      // "YYYY-MM-DD HH:mm:ss"
publisher:     string
title:         string
text:          string
image:         string|null
site:          string
url:           string
createdAt:     Timestamp   // server timestamp
expireAt:      Timestamp   // createdAt + 72h — TTL field; clients must also filter expireAt > now
                           // because Firestore TTL deletes up to 24h late
```

### `stock_news_notifier_state/ingestion` — read/written by this pipeline

Singleton document holding the cursor and the run lease (see `IngestionCursor` above). All mutations are transactions; the cursor only moves forward.

### `stock_news_cooldowns/{ticker}` — read/written by this pipeline

One document per ticker that has ever been notified. Not TTL'd (bounded by watchlist size).

```
ticker:         string     // doc ID
lastNotifiedAt: Timestamp  // updated transactionally in the same claim that authorizes a send
```
