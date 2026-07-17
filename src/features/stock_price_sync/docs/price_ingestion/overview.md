# Stock Price Sync — Price Ingestion Pipeline

## Purpose

Every minute from 9:30am to 4:05pm ET on weekdays this pipeline reads the global watchlist, fetches each ticker's current-session 1-minute chart from FMP (one API call per ticker — the endpoint does not support multi-symbol queries, and quote endpoints are not available on the current FMP plan), derives a compact price snapshot (latest price, change vs previous close, sparkline series), and overwrites `stock_prices/{ticker}` in Firestore. Bars are near-real-time, and the 4:05pm final run captures the complete session including the 4:00pm close (see [trigger.md](trigger.md)).

The design rests on one property: **each run writes a complete, self-contained snapshot of the current session**. Nothing is appended, accumulated, or cursored. Any failure — one ticker, one run, a whole outage — is fully repaired by the next successful run, at most 60 seconds later. This makes retries, queues, and dead-letter handling structurally unnecessary (see [design-decisions.md](design-decisions.md)).

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `stockPriceSync` | Cloud Scheduler | `* 9-16 * * 1-5` (`America/New_York`), gated in code to **9:30am–4:05pm ET** |

---

## End-to-End Flow

```
Cloud Scheduler (* 9-16 * * 1-5 ET, Mon–Fri)
         │
         ▼
stockPriceSync  [trigger.ts]  — pause/resume via the Cloud Scheduler job in the GCP console
         │
         ▼
StockPriceSyncUseCase.execute()  [usecase.ts]
  1 marketWindowGate()     ── outside 9:30am–4:05pm ET → return (cron can't express :30/:05)
  2 getWatchedTickers()    ── core watchlist_service   reads watchlist/{ticker} (cached per instance)
  3 selectCohort()         ── [usecase.ts]             maxCallsPerRun > 0 → deterministic round-robin slice
  4 per ticker, concurrency-limited (fetchConcurrency, default 8), errors isolated per ticker:
  │    a resolve prevClose  ── in-memory daily cache; miss → narrow SEED (Mon: today−3, else today−1)
  │    │                       no prior session? → widened retry (today − seedFallback)
  │    │                       hit → TODAY-ONLY fetch (from = to = today)     [fmp_chart_service.ts]
  │    b buildSnapshot()    ── [usecase.ts]            today's bars → price, change%, latestBarAt,
  │    │                       5-min-bucket series      (no today bars → skip ticker, doc untouched)
  │    c skip-if-unchanged  ── in-memory latestBarAt cache    same newest bar → skip write
  │    d upsertPrice()      ── [firestore_service.ts]  set() stock_prices/{ticker} (full overwrite)
  5 summary log             ── written / skipped / failed of total, run duration
```

---

## Source Code Structure

Code lives at the feature root (single sub-feature, so no `price_ingestion/` code folder — only the docs are nested):

```
src/features/stock_price_sync/
├── trigger.ts                    # Cloud Function entry point
├── usecase.ts                    # StockPriceSyncUseCase orchestration + snapshot derivation
├── constants/
│   └── index.ts                  # FEATURE_NAME, STOCK_PRICES_COLLECTION, defaults
├── models/
│   ├── index.ts                  # Barrel re-export
│   ├── IntradayBar.ts            # FMP DTO → domain type
│   ├── PricePoint.ts             # {t, c} sparkline point
│   ├── PriceSnapshot.ts          # Derived per-ticker snapshot
│   └── StoredStockPrice.ts       # Firestore document shape
└── services/
    ├── fmp_chart_service.ts      # FMP /historical-chart/1min fetch + boundary validation
    └── firestore_service.ts      # stock_prices upsert
```

Registered in `src/index.ts` via `export * from './features/stock_price_sync/trigger'`.

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `trigger.ts` | Cloud Function config, the 9:30–4:05 window rationale, entry point steps |
| [usecase.md](usecase.md) | `usecase.ts` | Orchestration, two-mode fetch, snapshot derivation, cohort selection, failure handling |
| [data-models.md](data-models.md) | `models/` | TypeScript interfaces + Firestore document schema |
| [fmp-chart-service.md](fmp-chart-service.md) | `services/fmp_chart_service.ts` | FMP API call, two fetch modes, validation, retry config |
| [firestore-service.md](firestore-service.md) | `services/firestore_service.ts` | Snapshot upsert |
| [tech-stack.md](tech-stack.md) | — | Technologies, Remote Config keys, confirmed FMP plan limits, cost envelope, resolved/open questions |
| [design-decisions.md](design-decisions.md) | — | Why the Pub/Sub fan-out plan was rejected; endpoint and bandwidth constraints; alternatives weighed |
