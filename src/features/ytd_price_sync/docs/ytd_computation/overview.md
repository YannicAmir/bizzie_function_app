# YTD Price Sync — YTD Computation

## Purpose

On weekdays, at 10:00 / 12:00 / 14:00 / 17:00 ET, this pipeline reads the global watchlist and keeps one YTD snapshot per ticker in `ytd_price_change/{ticker}` fresh. For each ticker it makes **one** FMP EOD-light call spanning mid-December of the prior year through today, derives the YTD baseline (the prior-year final close) and the latest close, computes the absolute and percentage change, and overwrites the document. One API call per ticker per run — the EOD endpoint is single-symbol and no bulk/batch endpoint is on the current FMP plan.

The design rests on one property: **each write is a complete, self-contained YTD recompute**. Nothing is appended, accumulated, or cursored. Any failure — one ticker, one run, a whole outage — is fully repaired by the next successful run. This makes retries, queues, phases, and cohort sharding structurally unnecessary here (see [design-decisions.md](design-decisions.md)).

---

## Triggers

| Function | Trigger | Schedule / Topic |
|---|---|---|
| `ytdPriceSync` | Cloud Scheduler | `0 10,12,14,17 * * 1-5` (`America/New_York`) — no in-code time gate; every fire runs the full pipeline |

---

## End-to-End Flow

```
Cloud Scheduler (0 10,12,14,17 * * 1-5 ET, Mon–Fri)
         │
         ▼
ytdPriceSync  [trigger.ts]  — composition root: wires services, requires FMP_API_KEY
         │
         ▼
YtdPriceSyncUseCase.execute()  [usecase.ts]  — owns the run sequence; each step delegated
  1 resolve year + today  ── core date_utils      todayEasternDate(now) → year, today (ET)
  2 loadWatchlist()       ── core watchlist_service  reads watchlist/{ticker} (cached per instance; retried)
  3 compute fetch window  ── core date_utils        from = subtractCalendarDays(`${year}-01-01`, baselineLookbackCalendarDays); to = today
  4 processWatchlist() — per ticker, concurrency-limited (fetchConcurrency, default 8), errors isolated per ticker:
  │    a fetchDailyCloses()  ── [fmp_eod_service.ts]  one EOD-light call over the window
  │    b buildYtdSnapshot()  ── [snapshot.ts]  baseline (prior-year final close) + latest → change $/%
  │                                └─ null (empty series / no prior-year close / baseline 0) → skipped, doc untouched
  │    c upsertYtd()         ── [firestore_service.ts]  set() ytd_price_change/{ticker} (full overwrite)
  5 logRunSummary()          ── written / skipped / failed of total · run duration
```

---

## Source Code Structure

Code lives at the feature root (single sub-feature, so no `ytd_computation/` code folder — only the docs are nested):

```
src/features/ytd_price_sync/
├── trigger.ts                    # Cloud Function entry point + composition root
├── usecase.ts                    # YtdPriceSyncUseCase — run orchestration (load → per-ticker workflow → summary)
├── snapshot.ts                   # buildYtdSnapshot — pure baseline/latest/change derivation
├── constants/
│   └── index.ts                  # FEATURE_NAME, YTD_PRICE_CHANGE_COLLECTION, schedule, runtime, warn threshold
├── models/
│   ├── EodClose.ts               # FMP EOD DTO → domain type ({date, close})
│   ├── YtdChangeSnapshot.ts      # Derived per-ticker snapshot (pre-persist)
│   └── StoredYtdChange.ts        # Firestore document shape
└── services/
    ├── fmp_client.ts             # Shared windowed-GET client (retry, timeout, transient policy)
    ├── fmp_eod_service.ts        # /historical-price-eod/light endpoint config over FmpClient
    └── firestore_service.ts      # ytd_price_change upsert
```

No `phase.ts`, `cohort.ts`, or `previous_close.ts` — those are `stock_price_sync` concerns that this feature deliberately does not need (see [design-decisions.md](design-decisions.md)). Also uses core `src/core/concurrency.ts` (`runWithConcurrency`). Registered in `src/index.ts` via `export * from './features/ytd_price_sync/trigger'`.

---

## Docs Index

| Doc | Code file | Contents |
|---|---|---|
| [trigger.md](trigger.md) | `trigger.ts` | Cloud Function config, entry point steps, kill switch |
| [usecase.md](usecase.md) | `usecase.ts` (+ `snapshot.ts`) | Run sequence, snapshot derivation, per-ticker failure handling |
| [data-models.md](data-models.md) | `models/` | TypeScript interfaces + Firestore document schema |
| [fmp-client.md](fmp-client.md) | `services/fmp_client.ts` | Shared windowed-GET client: endpoint abstraction, retry/timeout, transient-error policy |
| [fmp-eod-service.md](fmp-eod-service.md) | `services/fmp_eod_service.ts` | EOD-light endpoint config, full-year window, `parseEodClose` |
| [firestore-service.md](firestore-service.md) | `services/firestore_service.ts` | Snapshot upsert |
| [tech-stack.md](tech-stack.md) | — | Technologies, Remote Config key, FMP plan limits, cost envelope, resolved/open questions |
| [design-decisions.md](design-decisions.md) | — | Keystone property; simplifications vs `stock_price_sync`; baseline choice; alternatives weighed |
