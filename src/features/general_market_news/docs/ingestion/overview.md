# General Market News — Ingestion Pipeline

## Purpose

Every minute the Cloud Scheduler job ticks, but the pipeline only actually polls FMP once per `runIntervalSeconds` (Remote Config, default 300s = 5 minutes) — every other tick is a cheap no-op. This makes the poll cadence a runtime switch: flipping `runIntervalSeconds` to `60` polls every minute instead of every 5, with no redeploy. No ticker filtering, no watchlist read, no notifications — every article FMP returns is eligible for storage. An ingestion cursor (high-water mark on `publishedDate`) plus an overlap window and create-only writes make the pipeline exactly-once for storage, the same guarantee [stock_news_notifier](../../../stock_news_notifier/docs/ingestion_and_messaging/overview.md) provides for ticker news.

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `generalMarketNews` | Cloud Scheduler | `* * * * *` — every minute, all day (finest poll tick; see [tech-stack.md](tech-stack.md#remote-config) for the Remote Config cadence gate) |

---

## End-to-End Flow

```
Cloud Scheduler (every minute — finest poll tick)
         │
         ▼
generalMarketNews  [trigger.ts]  — pause/resume via the Cloud Scheduler job in the GCP console
         │
         ▼
GeneralMarketNewsUseCase.execute()  [usecase.ts]
  1 acquireLease(runIntervalSeconds) ── [firestore_service.ts] txn on general_market_news_state/ingestion
  │                            lease held by another run, OR lastRunAt + runIntervalSeconds > now?
  │                            → log + exit (no FMP call — this tick is a no-op by design)
  2 getCursor()              ── [firestore_service.ts]    → lastPublishedDate watermark
  3 fetchSinceWatermark()    ── [fmp_news_service.ts]     pages 0..N of /news/general-latest until
  │                             oldest item < watermark − overlapWindow (or maxPages → ranged backfill)
  4 filter + dedupe-create   ── [firestore_service.ts]    publishedDate ≥ overlapCutoff → create
  │                             general_market_news/{newsId}; ALREADY_EXISTS → skip silently
  5 advanceCursor()          ── [firestore_service.ts]    txn: watermark = max(publishedDate fetched)
  6 releaseLease()           ── [firestore_service.ts]    best-effort (lease self-expires on crash)
```

---

## Source Code Structure

Code lives at the feature root (single sub-feature, so no `ingestion/` code folder — only the docs are nested):

```
src/features/general_market_news/
├── trigger.ts                    # Cloud Function entry point
├── usecase.ts                    # GeneralMarketNewsUseCase orchestration
├── constants/
│   └── index.ts                  # FEATURE_NAME, collection names, defaults
├── models/
│   ├── index.ts                  # Barrel re-export
│   ├── GeneralNewsArticle.ts     # FMP DTO → domain type
│   ├── StoredGeneralNews.ts      # Firestore document shape
│   ├── IngestionCursor.ts        # Cursor + lease state
│   └── FetchResult.ts            # Fetch outcome (articles, pagesFetched, reachedOverlap)
└── services/
    ├── fmp_news_service.ts       # FMP /news/general-latest fetch (latest + ranged backfill)
    └── firestore_service.ts      # general_market_news writes, cursor/lease transactions
```

Registered in `src/index.ts` via `export * from './features/general_market_news/trigger'`.

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `trigger.ts` | Cloud Function config and entry point steps |
| [usecase.md](usecase.md) | `usecase.ts` | Orchestration steps, cursor algorithm, failure handling |
| [data-models.md](data-models.md) | `models/` | TypeScript interfaces + Firestore document schemas |
| [firestore-service.md](firestore-service.md) | `services/firestore_service.ts` | News writes, cursor, lease transactions |
| [fmp-news-service.md](fmp-news-service.md) | `services/fmp_news_service.ts` | FMP API calls, pagination, retry config |
| [tech-stack.md](tech-stack.md) | — | Technologies, retry strategy, Remote Config keys, open questions |
| [ttl-setup.md](ttl-setup.md) | — | One-time GCP setup for the Firestore TTL policy on `general_market_news.expireAt` |
