# fmp_news_service.ts

Fetches general market news from the FMP stable API with cursor-aware pagination. Structurally identical to [stock_news_notifier/fmp_news_service.ts](../../../stock_news_notifier/docs/ingestion_and_messaging/fmp-news-service.md), pointed at the general-news endpoint and mapping one fewer field (`symbol`).

Imports: `retry` from `src/core/retry`, `getRemoteConfig` from `src/core/remote-config`, `Logger` from `src/core/logger`.

[← back to overview](overview.md)

---

## API

| Item | Value |
|---|---|
| Base URL | `getRemoteConfig().fmp.baseUrl` → `https://financialmodelingprep.com/stable` |
| Endpoint | `GET {baseUrl}/news/general-latest` |
| Params | `page` (number), `limit` (number), optional `from` / `to` (date `YYYY-MM-DD`), `apikey` |
| Auth | `apikey` query param — `FMP_API_KEY` from Secret Manager, injected via `defineSecret` (same secret `stock_news_notifier` uses) |

Retry config (per page fetch):

```typescript
retry(fetchPage, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
});   // 1s → 2s → throw
```

Non-`response.ok` throws `Error("FMP API Error: {status} {statusText}")` (retried). A non-array JSON body also throws (`"FMP API returned a non-array response for page {page}"`) and is retried — treating it as an empty page would fake feed exhaustion, skip the backfill fallback, and open a silent coverage gap.

---

## Functions

### `fetchSinceWatermark(watermark: string, cfg: GeneralMarketNewsConfig): Promise<FetchResult>`

1. Computes `overlapCutoff = watermark − cfg.overlapWindowSeconds` (parsed/formatted in `America/New_York`; compared as string thereafter).
2. Fetches `page = 0..cfg.maxPages − 1` with `limit = cfg.pageLimit`, accumulating mapped articles. Stops early when a page's oldest `publishedDate < overlapCutoff` (`reachedOverlap = true`) or a page returns fewer than `limit` items (feed exhausted).
3. If `maxPages` was exhausted with `reachedOverlap = false`, calls `fetchRange(date(watermark), today, cfg)` and merges the results — the ranged fetch re-reads whole days, which is safe because `createNewsIfAbsent` deduplicates.
4. Returns `{ articles, pagesFetched, reachedOverlap, maxPublishedDate }`.

### `fetchRange(from: string, to: string, cfg: GeneralMarketNewsConfig): Promise<GeneralNewsArticle[]>`

Same endpoint with `from`/`to` params, pages `0..cfg.maxBackfillPages − 1`, stopping when a page returns fewer than `limit` items. Hitting `maxBackfillPages` logs at **error** with `from`/`to` (the alerting signal that a coverage gap may exist).

---

## Mapping

Each raw item is validated at the boundary (`parseFmpGeneralNews`) before mapping to `GeneralNewsArticle` ([data-models.md](data-models.md)):
- Rows that are not objects, or whose `url` or `publishedDate` is missing, empty, or not a string, are dropped and counted in a single info log per page.
- `symbol` is read but discarded — this endpoint always returns `null` for it (confirmed from sample data); it is not part of the domain type.
- `image` normalized to `null` when absent or empty.
- No client-side date filtering here — the use case applies `overlapCutoff`; this service only decides fetch depth.
