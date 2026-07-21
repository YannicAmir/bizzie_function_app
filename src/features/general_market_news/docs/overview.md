# General Market News

## Purpose

Polls the FMP latest general-news feed on a Remote-Config-controlled interval (default every 5 minutes) and persists every article to Firestore with a 2-day TTL. Unlike [stock_news_notifier](../stock_news_notifier/docs/overview.md), articles are not tied to a ticker — there is no watchlist filter and no push notification. A Firestore ingestion cursor with an overlap window guarantees no article is missed between runs and no article is processed twice, even across function crashes, FMP outages, and overlapping invocations.

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [ingestion](ingestion/overview.md) | Cloud Scheduler `* * * * *` (every minute; effective poll cadence gated by Remote Config `runIntervalSeconds`, default 300s) | Cursor-based FMP fetch · idempotent Firestore write (TTL 2d) |

---

## High-Level Architecture

```
Cloud Scheduler (every minute — finest poll tick)
         │
         ▼
generalMarketNews  [trigger.ts]
         │
         ▼
GeneralMarketNewsUseCase  [usecase.ts]
   ├── gate    runIntervalSeconds elapsed?    (Remote Config; skip tick if not — no FMP call)
   ├── reads  FMP /news/general-latest                    (cursor + overlap pagination)
   ├── writes general_market_news/{newsId}                (create-only, expireAt TTL = +48h)
   └── r/w    general_market_news_state/ingestion         (cursor + run lease + last-run gate)
```

**Remote-switch polling frequency.** The Cloud Scheduler job always ticks every minute — the finest cadence the pipeline can ever poll at. The *actual* FMP-polling frequency is controlled by the `runIntervalSeconds` field in the `general_market_news_config` Remote Config key (default `300` = 5 minutes). Setting it to `60` makes the pipeline poll every minute instead of every 5, with no redeploy — see [ingestion/tech-stack.md](ingestion/tech-stack.md#remote-config).

---

## Shared Data Model — `StoredGeneralMarketNews`

Written to `general_market_news/{newsId}` where `newsId = sha256(url)`. FMP general news carries no ticker (`symbol` is always `null` on this endpoint), so the dedup key is the URL alone — unlike `stock_news`, which prefixes with `symbol` to disambiguate the same URL reused across tickers.

| Field | Type | Description |
|---|---|---|
| `newsId` | string | sha256 of `url` — also the document ID |
| `publishedDate` | string | Raw FMP publish time, `"YYYY-MM-DD HH:mm:ss"` (US/Eastern) |
| `publishedAt` | Timestamp | `publishedDate` parsed as `America/New_York` — the client sort/filter field |
| `publisher` | string | e.g. `"Bloomberg Markets and Finance"` |
| `title` | string | Article headline |
| `text` | string | Article body/summary from FMP |
| `image` | string \| null | Article image URL |
| `site` | string | Source domain, e.g. `"seekingalpha.com"` |
| `url` | string | Canonical article URL |
| `createdAt` | Timestamp | Server timestamp at write |
| `expireAt` | Timestamp | `createdAt + 48h` — TTL field only, never queried (see [ttl-setup.md](ingestion/ttl-setup.md)) |
