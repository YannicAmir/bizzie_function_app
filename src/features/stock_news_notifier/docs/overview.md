# Stock News Notifier

## Purpose

Polls the FMP latest stock-news feed every minute, filters articles to tickers on the global watchlist, persists matched articles to Firestore with a 3-day TTL, and pushes one FCM topic notification per ticker. A Firestore ingestion cursor with an overlap window guarantees no article is missed between runs and no article is processed twice — even across function crashes, FMP outages, and overlapping invocations.

---

## Sub-features

| Sub-feature | Trigger | Responsibility |
|---|---|---|
| [ingestion_and_messaging](ingestion_and_messaging/overview.md) | Cloud Scheduler `* 4-23 * * *` (every minute, 4am–midnight EST) | Cursor-based FMP fetch · watchlist filter · idempotent Firestore write (TTL 3d) · FCM topic notify with per-ticker cooldown |

---

## High-Level Architecture

```
Cloud Scheduler (every minute, 4:00am–11:59pm EST)
         │
         ▼
stockNewsNotifier  [trigger.ts]
         │
         ▼
StockNewsNotifierUseCase  [usecase.ts]
   ├── reads  watchlist/{ticker}                        (written by watchlist_aggregator)
   ├── reads  FMP /news/stock-latest                    (cursor + overlap pagination)
   ├── writes stock_news/{newsId}                       (create-only, expireAt TTL = +72h)
   ├── r/w    stock_news_notifier_state/ingestion       (cursor + run lease)
   ├── r/w    stock_news_cooldowns/{ticker}             (notification rate limit)
   └── sends  FCM topic {ticker}  ──────────────►  User devices
```

---

## Shared Data Model — `StoredStockNews`

Written to `stock_news/{newsId}` where `newsId = sha256("{symbol}|{url}")`. The front end queries this collection for the in-app news feed and receives the same `newsId` in the notification data payload for deep-linking.

| Field | Type | Description |
|---|---|---|
| `newsId` | string | sha256 of `"{symbol}\|{url}"` — also the document ID |
| `symbol` | string | Ticker, uppercase (FCM topic name) |
| `publishedDate` | string | Raw FMP publish time, `"YYYY-MM-DD HH:mm:ss"` (US/Eastern) |
| `publishedAt` | Timestamp | `publishedDate` parsed as `America/New_York` — the client sort/filter field |
| `publisher` | string | e.g. `"Proactive Investors"` |
| `title` | string | Article headline |
| `text` | string | Article body/summary from FMP |
| `image` | string \| null | Article image URL |
| `site` | string | Source domain |
| `url` | string | Canonical article URL |
| `createdAt` | Timestamp | Server timestamp at write |
| `expireAt` | Timestamp | `createdAt + 72h` — TTL field only, never queried (see [ttl-setup.md](ingestion_and_messaging/ttl-setup.md)) |
