# Stock Price Sync — Price Ingestion Pipeline

## Purpose

On weekdays this pipeline reads the global watchlist and keeps one compact snapshot per ticker in `stock_prices/{ticker}` fresh, in three ET phases: a **pre-open EOD seed** (9:15–9:29) that establishes each ticker's `previousClose` from the prior session's official closing-auction price; the **intraday loop** (9:30–4:05pm) that fetches each ticker's current-session 1-minute chart, derives a compact snapshot (latest price, change vs previous close, sparkline series), and overwrites the document; and a **post-close EOD finalize** (4:20pm+) that replaces the day's `price` with the official close once the ~15-min-delayed EOD record publishes. One API call per ticker per phase — neither the 1-min chart nor the EOD endpoint supports multi-symbol queries, and no bulk/batch endpoint is on the current FMP plan.

The design rests on one property: **each write is a complete, self-contained snapshot of the current session**. Nothing is appended, accumulated, or cursored. Any failure — one ticker, one run, a whole outage — is fully repaired by the next successful run. This makes retries, queues, and dead-letter handling structurally unnecessary (see [design-decisions.md](design-decisions.md)).

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `stockPriceSync` | Cloud Scheduler | `* 9-16 * * 1-5` (`America/New_York`), gated in code into pre-open seed / intraday / post-close finalize phases |

---

## End-to-End Flow

```
Cloud Scheduler (* 9-16 * * 1-5 ET, Mon–Fri)
         │
         ▼
stockPriceSync  [trigger.ts]  — pause/resume via the Cloud Scheduler job in the GCP console
         │
         ▼
StockPriceSyncUseCase.execute()  [usecase.ts]  — owns the step sequence; each step is delegated
  1 resolvePhase()       ── [phase.ts]                ET time → pre-open seed | intraday | post-close finalize | idle
  2 loadWatchlist()      ── core watchlist_service    reads watchlist/{ticker} (cached per instance)
  3 selectCohort()       ── [cohort.ts]               maxCallsPerRun > 0 → deterministic round-robin slice
  4 processCohort() — per ticker, concurrency-limited (fetchConcurrency, default 8), errors isolated per ticker:
  │
  │  PRE-OPEN SEED (9:15–9:29):
  │    PreviousCloseResolver.resolve()  ── [previous_close.ts]  narrow EOD window (+ widen-on-miss),
  │                                newest record before today → previousClose cache; no write
  │
  │  INTRADAY (9:30–4:05pm):
  │    a resolveCachedPreviousClose() ── [previous_close.ts]  cache hit, else resolve (cold-instance self-heal)
  │    b fetchTodayBars()   ── [fmp_chart_service.ts]  today-only 1-min bars
  │    c buildIntradaySnapshot() ── [snapshot.ts]  price, change%, latestBarAt, 5-min series
  │    d skip-if-unchanged  ── in-memory latestBarAt cache → same newest bar → skip write
  │    e writeSnapshot()    ── [firestore_service.ts]  set() stock_prices/{ticker} (full overwrite)
  │
  │  POST-CLOSE FINALIZE (4:20pm+, once per ticker/day):
  │    a resolveFinalizeClose()  ── [usecase.ts] + [previous_close.ts]  record for date==today? (guarded, not clock-based)
  │    b fetchTodayBars()   ── [fmp_chart_service.ts]  today-only 1-min bars
  │    c buildFinalizedSnapshot() ── [snapshot.ts]  price = official close, append 16:00 point, closeFinalized=true
  │    d writeSnapshot() (bypass skip)  ── [firestore_service.ts]  unconditional set(); mark finalizedCache
  │
  5 logRunSummary()          ── phase · written / skipped / failed of total · run duration
```

---

## Source Code Structure

Code lives at the feature root (single sub-feature, so no `price_ingestion/` code folder — only the docs are nested):

```
src/features/stock_price_sync/
├── trigger.ts                    # Cloud Function entry point + composition root (wires the resolver)
├── usecase.ts                    # StockPriceSyncUseCase — run orchestration + per-phase workflow
├── previous_close.ts             # PreviousCloseResolver — EOD windowing/fallback + previousClose cache (injected)
├── phase.ts                      # resolvePhase() + Phase type — ET-minute → phase policy
├── cohort.ts                     # selectCohort() — deterministic watchlist sharding
├── snapshot.ts                   # buildIntradaySnapshot / buildFinalizedSnapshot — pure snapshot derivation
├── constants/
│   └── index.ts                  # FEATURE_NAME, STOCK_PRICES_COLLECTION, phase-boundary minutes, defaults
├── models/
│   ├── index.ts                  # Barrel re-export
│   ├── IntradayBar.ts            # FMP 1-min DTO → domain type
│   ├── DailyClose.ts             # FMP EOD DTO → domain type ({date, close})
│   ├── PricePoint.ts             # {t, c} sparkline point
│   ├── PriceSnapshot.ts          # Derived per-ticker snapshot
│   └── StoredStockPrice.ts       # Firestore document shape
└── services/
    ├── fmp_client.ts             # Shared windowed-GET client (retry, timeout, transient policy)
    ├── fmp_chart_service.ts      # /historical-chart/1min endpoint config over FmpClient
    ├── fmp_eod_service.ts        # /historical-price-eod/light endpoint config over FmpClient
    └── firestore_service.ts      # stock_prices upsert
```

Also uses core `src/core/concurrency.ts` (`runWithConcurrency`). Registered in `src/index.ts` via `export * from './features/stock_price_sync/trigger'`.

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `trigger.ts` | Cloud Function config, the three-phase gate rationale, entry point steps |
| [usecase.md](usecase.md) | `usecase.ts` (+ `phase.ts`, `cohort.ts`, `previous_close.ts`, `snapshot.ts`) | Phase gate, seed/intraday/finalize bodies, snapshot derivation, cohort selection, failure handling |
| [data-models.md](data-models.md) | `models/` | TypeScript interfaces + Firestore document schema |
| [fmp-client.md](fmp-client.md) | `services/fmp_client.ts` | Shared windowed-GET client: endpoint abstraction, retry/timeout, transient-error policy |
| [fmp-chart-service.md](fmp-chart-service.md) | `services/fmp_chart_service.ts` | 1-min intraday endpoint config, today-only window, `parseFmpBar` |
| [fmp-eod-service.md](fmp-eod-service.md) | `services/fmp_eod_service.ts` | EOD official-close endpoint config, windowed lookup, widen-on-miss, `parseEodClose` |
| [firestore-service.md](firestore-service.md) | `services/firestore_service.ts` | Snapshot upsert |
| [tech-stack.md](tech-stack.md) | — | Technologies, Remote Config keys, confirmed FMP plan limits, cost envelope, resolved/open questions |
| [design-decisions.md](design-decisions.md) | — | Auction-close problem & EOD sourcing; Pub/Sub rejection; endpoint/bandwidth constraints; alternatives weighed |
