# fmp_news_service.ts

Fetches stock news from the FMP stable API with cursor-aware pagination. Modeled on `FmpSecService` (`src/core/services/sec_service.ts`): constructor takes the API key, base URL comes from Remote Config, every page fetch is wrapped in `retry()`.

Imports: `retry` from `src/core/retry`, `getRemoteConfig` from `src/core/remote-config`, `Logger` from `src/core/logger`.

[← back to overview](overview.md)

---

## API

| Item | Value |
|---|---|
| Base URL | `getRemoteConfig().fmp.baseUrl` → `https://financialmodelingprep.com/stable` |
| Endpoint | `GET {baseUrl}/news/stock-latest` |
| Params | `page` (number), `limit` (number), optional `from` / `to` (date `YYYY-MM-DD`), `apikey` |
| Auth | `apikey` query param — `FMP_API_KEY` from Secret Manager, injected via `defineSecret` |

Retry config (per page fetch):

```typescript
retry(fetchPage, {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffFactor: 2,
});   // 1s → 2s → throw
```

Non-`response.ok` throws `Error("FMP API Error: {status} {statusText}")` (retried). A non-array JSON body is logged at error and treated as an empty page (not retried) — same convention as `FmpSecService`.

---

## Functions

### `fetchSinceWatermark(watermark: string, cfg: StockNewsConfig): Promise<FetchResult>`

1. Computes `overlapCutoff = watermark − cfg.overlapWindowSeconds` (parsed/formatted in `America/New_York`; compared as string thereafter).
2. Fetches `page = 0..cfg.maxPages − 1` with `limit = cfg.pageLimit`, accumulating mapped articles. Stops early when a page's oldest `publishedDate < overlapCutoff` (`reachedOverlap = true`) or a page returns fewer than `limit` items (feed exhausted).
3. If `maxPages` was exhausted with `reachedOverlap = false`, calls `fetchRange(date(watermark), today, cfg)` and merges the results — the ranged fetch re-reads whole days, which is safe because `createNewsIfAbsent` deduplicates.
4. Returns `{ articles, pagesFetched, reachedOverlap, maxPublishedDate }`.

### `fetchRange(from: string, to: string, cfg: StockNewsConfig): Promise<StockNewsArticle[]>`

Same endpoint with `from`/`to` params, pages `0..cfg.maxBackfillPages − 1`, stopping when a page returns fewer than `limit` items. Hitting `maxBackfillPages` logs at **error** with `from`/`to` (the alerting signal that a coverage gap may exist).

---

## Mapping

Each FMP DTO maps 1:1 to `StockNewsArticle` ([data-models.md](data-models.md)) with:
- `symbol` uppercased and trimmed.
- `image` normalized to `null` when absent or empty.
- Items missing `symbol`, `url`, or `publishedDate` are dropped and counted in a single warn log per run.
- No client-side date filtering here — the use case applies `overlapCutoff`; this service only decides fetch depth.
