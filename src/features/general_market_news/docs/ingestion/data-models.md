# Data Models

Defined in `models/` — one interface per file, re-exported through `models/index.ts`. Services and the use case import from `../models`.

[← back to overview](overview.md)

---

## Domain Types

```typescript
interface GeneralNewsArticle {
  publishedDate: string;   // "YYYY-MM-DD HH:mm:ss" — US/Eastern, lexicographically sortable
  publisher: string;
  title: string;
  image: string | null;    // FMP may omit
  site: string;            // source domain, e.g. "seekingalpha.com"
  text: string;
  url: string;             // canonical article URL — the entire dedup key (no symbol on this feed)
}

interface FetchResult {
  articles: GeneralNewsArticle[];  // all pages merged, unfiltered
  pagesFetched: number;
  reachedOverlap: boolean;         // false → maxPages hit before overlapCutoff → backfill ran
  maxPublishedDate: string;        // newest publishedDate seen — next cursor value
}

interface IngestionCursor {
  lastPublishedDate: string;     // high-water mark, "YYYY-MM-DD HH:mm:ss"
  lastRunAt: Timestamp;          // set at the start of every attempted run; gates poll frequency via runIntervalSeconds
  leaseExpiresAt: Timestamp;     // run lock; expired lease = no active run
  updatedAt: Timestamp;          // last successful cursor advance (may lag lastRunAt on a fetch failure)
}
```

`publishedDate` is compared as a plain string everywhere (the FMP format sorts lexicographically). It is parsed as `America/New_York` only when computing `overlapCutoff` and the first-run bootstrap watermark — never stored converted. The raw FMP payload's `symbol` field is always `null` on `/news/general-latest` (confirmed from sample data) and is dropped during mapping rather than carried through as a domain field.

---

## Firestore Document Schemas

### `general_market_news/{newsId}` — written by this pipeline

`{newsId}` = `sha256(url)`. Unlike `stock_news/{newsId}` (which prefixes with `symbol` because the same URL can serve multiple tickers), general news has no ticker to disambiguate, so the URL alone is the natural key. Written with `create()` (never `set`) — the failed `ALREADY_EXISTS` write **is** the dedup mechanism; no separate processed-items collection. A TTL policy on `expireAt` deletes documents ~48h after creation (see [ttl-setup.md](ttl-setup.md)).

```
newsId:        string      // duplicated from doc ID for client queries
publishedDate: string      // "YYYY-MM-DD HH:mm:ss" — raw FMP value, kept for traceability
publishedAt:   Timestamp   // publishedDate parsed as America/New_York — the client sort/filter field
publisher:     string
title:         string
text:          string
image:         string|null
site:          string
url:           string
createdAt:     Timestamp   // server timestamp
expireAt:      Timestamp   // createdAt + 48h — TTL field only; clients never query it
```

**Front-end read pattern.** No `symbol` filter — a single feed query:

```typescript
db.collection('general_market_news')
  .orderBy('publishedAt', 'desc')
  .limit(50);
```

Requires one index in `firestore.indexes.json` (single-field descending on `publishedAt` — Firestore auto-creates single-field indexes, so no explicit entry is required unless combined with a `where` clause later).

### `general_market_news_state/ingestion` — read/written by this pipeline

Singleton document holding the cursor, run lease, and poll-interval gate (see `IngestionCursor` above). All mutations are transactions; the cursor only moves forward. `lastRunAt` is the field that makes poll frequency a Remote Config switch — see [firestore-service.md](firestore-service.md).
