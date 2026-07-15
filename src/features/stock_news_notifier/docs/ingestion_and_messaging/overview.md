# Stock News Notifier — Ingestion & Messaging Pipeline

## Purpose

Every minute this pipeline fetches the newest stock news from FMP, keeps only articles whose ticker is on the global watchlist, stores them idempotently in Firestore (3-day TTL), and sends one coalesced FCM topic notification per ticker. An ingestion cursor (high-water mark on `publishedDate`) plus an overlap window and create-only writes make the pipeline exactly-once for storage and at-least-once-with-dedup for notifications.

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `stockNewsNotifier` | Cloud Scheduler | `* 4-23 * * *` — every minute, 4:00am–11:59pm EST (`America/New_York`) |

---

## End-to-End Flow

```
Cloud Scheduler (every minute, 4:00am–11:59pm EST)
         │
         ▼
stockNewsNotifier  [trigger.ts]  — pause/resume via the Cloud Scheduler job in the GCP console
         │
         ▼
StockNewsNotifierUseCase.execute()  [usecase.ts]
  1 acquireLease()          ── [firestore_service.ts] txn on stock_news_notifier_state/ingestion
  │                            lease held by another run? → log + exit
  2 getWatchedTickers()     ── core watchlist_service    reads watchlist/{ticker} (cached per instance)
  3 getCursor()             ── [firestore_service.ts]    → lastPublishedDate watermark
  4 fetchSinceWatermark()   ── [fmp_news_service.ts]     pages 0..N of /news/stock-latest until
  │                            oldest item < watermark − overlapWindow (or maxPages → ranged backfill)
  5 filter + dedupe-create  ── [firestore_service.ts]    symbol ∈ watchlist → create stock_news/{newsId}
  │                            ALREADY_EXISTS → already processed, skip silently
  6 notifyPerTicker()       ── [fcm_service.ts]          coalesce per ticker, cooldown claim via
  │                            stock_news_cooldowns/{ticker}, send FCM topic {ticker}
  7 advanceCursor()         ── [firestore_service.ts]    txn: watermark = max(publishedDate fetched)
  8 releaseLease()          ── [firestore_service.ts]    best-effort (lease self-expires on crash)
```

---

## Source Code Structure

```
src/features/stock_news_notifier/
└── ingestion_and_messaging/
    ├── trigger.ts                    # Cloud Function entry point
    ├── usecase.ts                    # StockNewsNotifierUseCase orchestration
    ├── constants/
    │   └── index.ts                  # FEATURE_NAME, collection names, defaults
    ├── models/
    │   ├── index.ts                  # Barrel re-export
    │   ├── StockNewsArticle.ts       # FMP DTO → domain type
    │   ├── StoredStockNews.ts        # Firestore document shape
    │   ├── IngestionCursor.ts        # Cursor + lease state
    │   └── FetchResult.ts            # Fetch outcome (articles, pagesFetched, reachedOverlap)
    └── services/
        ├── fmp_news_service.ts       # FMP /news/stock-latest fetch (latest + ranged backfill)
        ├── firestore_service.ts      # stock_news writes, cursor/lease/cooldown transactions
        └── fcm_service.ts            # FCM topic send with APNS collapse id
```

Registered in `src/index.ts` via `export * from './features/stock_news_notifier/ingestion_and_messaging/trigger'`.

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `trigger.ts` | Cloud Function config and entry point steps |
| [usecase.md](usecase.md) | `usecase.ts` | Orchestration steps, cursor algorithm, failure handling |
| [data-models.md](data-models.md) | `models/` | TypeScript interfaces + Firestore document schemas |
| [firestore-service.md](firestore-service.md) | `services/firestore_service.ts` | News writes, cursor, lease, cooldown transactions |
| [fmp-news-service.md](fmp-news-service.md) | `services/fmp_news_service.ts` | FMP API calls, pagination, retry config |
| [fcm-service.md](fcm-service.md) | `services/fcm_service.ts` | Topic notification with collapse id and payload shape |
| [tech-stack.md](tech-stack.md) | — | Technologies, retry strategy, Remote Config keys, open questions |
| [design-decisions.md](design-decisions.md) | — | Evaluation of the original plan, hardening changes, pros/cons, alternatives |
| [ttl-setup.md](ttl-setup.md) | — | One-time GCP setup for the Firestore TTL policy on `stock_news.expireAt` |
