# usecase.ts

Describes `StockPriceSyncUseCase.execute()`. The run first resolves which **phase** it is in from the current ET time, then dispatches. The intraday phase processes tickers concurrently under a `fetchConcurrency` limit with per-ticker error isolation (`Promise.allSettled` semantics — one ticker's failure never affects another). Nothing is fire-and-forget. Interfaces are defined in [data-models.md](data-models.md).

`execute()` is a thin orchestrator: it owns only the step **sequence** and delegates each step below to a named method — `loadWatchlist` (Step 2), `selectCohort` (Step 3), `processCohort` (the Step 4 concurrency loop), and `logRunSummary` (Step 5). Keep it that way — inlining a step back into `execute()` is the Single-Responsibility/length regression the audit now checks for.

**Module layout.** `usecase.ts` holds only run orchestration and the per-phase workflow (`processSeed`/`processIntraday`/`processFinalize`). The separable concerns live in sibling modules: **phase policy** in [phase.ts](../../phase.ts) (`resolvePhase` + `Phase`), **cohort sharding** in `cohort.ts` (`selectCohort`), **snapshot derivation** in `snapshot.ts` (`buildIntradaySnapshot`/`buildFinalizedSnapshot`, pure), and **previous-close / EOD resolution + its warm-instance cache** in `previous_close.ts` (`PreviousCloseResolver`, injected into the use case via `trigger.ts`). The `latestBarAt` and `finalized` caches remain module-scope in `usecase.ts` — they are intraday/finalize workflow state, not previous-close state.

[← back to overview](overview.md)

---

## Phase gate (Step 1)

Compute the current time in `America/New_York` as minutes-since-midnight and dispatch:

| ET window | Phase | Action |
|---|---|---|
| < 9:15 or 16:06–16:19 or > 16:59 | **idle** | log at debug and return (cron fires but there is nothing to do) |
| **9:15–9:29** | **pre-open EOD seed** | warm `previousClose` for the cohort from the EOD endpoint; **no Firestore writes** (no today bars yet) |
| **9:30–16:05** | **intraday** | the per-ticker 1-min snapshot loop (unchanged core behavior) |
| **16:20–16:59** | **post-close finalize** | overwrite each ticker's `price` with the official EOD close, once today's EOD record exists |

The cron (`* 9-16 * * 1-5`) cannot express these boundaries, so the gate trims and routes. A gated-idle exit costs milliseconds and zero FMP calls.

All phases share: **load watched tickers** (Step 2) and **cohort selection** (Step 3), then run the phase body per ticker under the concurrency limit (Step 4), then emit a **summary log** (Step 5).

---

## Step 2 — Load watched tickers

Core `FirebaseWatchlistService.getAllWatchedTickers()` → `Map<ticker, companyName>` from `watchlist/{ticker}`. Cached at module scope for `stock_prices.watchlistCacheSeconds` (default 300s). Empty map → log at info and return. Fetch failure after retries → log error and return; the next run retries.

## Step 3 — Select cohort

If `stock_prices.maxCallsPerRun` is `0` (default), process every ticker. Otherwise compute `numCohorts = ceil(watchlistSize / maxCallsPerRun)`, sort tickers alphabetically, and keep tickers where `index % numCohorts === minuteOfDay % numCohorts`. Deterministic and stateless. (Cohorting throttles the intraday loop; the pre-open and finalize phases are two short bursts well within quota and normally run the full watchlist.)

---

## Module-scope caches

Rebuilt on cold start; persist across invocations on a warm instance:

- `previousCloseCache: Map<ticker, { sessionDate, previousClose }>` — **owned by `previous_close.ts`** (`PreviousCloseResolver`). One EOD seed per ticker per day, cached even when `null` (new listing / no prior session), so the seed runs at most once per ticker per day. Managed via the resolver's `isFresh` / `cache` methods.
- `latestBarAtCache: Map<ticker, latestBarAt>` — in `usecase.ts`; intraday unchanged-skip key, set only after a successful write.
- `finalizedCache: Map<ticker, sessionDate>` — in `usecase.ts`; marks a ticker whose official close has been written today, making the finalize phase self-disabling and idempotent.

---

## Phase body — pre-open EOD seed (9:15–9:29)

Per ticker, concurrency-limited (`processSeed`): if `previousClose.isFresh(ticker, today)`, skip. Otherwise call `PreviousCloseResolver.resolve(ticker, cfg, today)` (below) and `cache(...)` the result under today's `sessionDate`. **No snapshot is built and nothing is written** — there are no today bars yet; the phase only front-loads the EOD calls off the intraday hot path so `previousClose` is ready at 9:30. (A cold instance appearing mid-session self-heals the same way via the intraday cache-miss.)

`PreviousCloseResolver.resolve(ticker, cfg, today)` → `{ previousClose, todayClose }`:
- EOD **narrow** fetch: `FmpEodService.fetchDailyCloses(ticker, { from: today − eodLookbackCalendarDays, to: today })` (default 4).
- `previousClose` = `close` of the newest record with `date < today`; `todayClose` = `close` of the record dated today (used by finalize).
- If **no record before today** (a holiday cluster) → one **widened** retry: `from = today − eodFallbackCalendarDays` (default 10). Still none → `previousClose = null`.

## Phase body — intraday (9:30–16:05)

Per ticker (concurrency limited to `stock_prices.fetchConcurrency`, default 8):

1. **Resolve previousClose (cache-first) & fetch today's bars** —
   - `PreviousCloseResolver.resolveCachedPreviousClose(ticker, cfg, today)` — cache hit → use it; miss (cold instance) → `resolve` and cache under today's `sessionDate` (including `null`). A failed EOD fetch here logs a warn and returns `null` (not cached, so it retries next run) — `price`/`series` still write with `change = null`.
   - `FmpChartService.fetchIntradayBars(ticker, { from: today, to: today })` — today-only 1-min bars.
   - Fetch failure after retries → count as `failed`, log per ticker, continue; stale ≤ 60s until the next run.
2. **Build snapshot** — pure function `buildIntradaySnapshot({ ticker, companyName, bars, previousClose, today, bucketMinutes })` (in `snapshot.ts`):
   - Keep only bars whose `"YYYY-MM-DD"` prefix equals **today's** ET date. No today bars → return `null` (skip with a debug log; existing document untouched).
   - Sort ascending by `date`. `sessionDate` = today; `price` = last bar's close; `latestBarAt` = last bar's `date`.
   - `change`/`changePercent` from `price` and `previousClose`; both `null` when `previousClose` is `null` or `0`.
   - `series` = today's bars downsampled into `seriesBucketMinutes` buckets (newest bar per bucket, in-progress bucket included). `closeFinalized` = `false`.
3. **Skip if unchanged** — if `latestBarAtCache.get(ticker)` equals the snapshot's `latestBarAt`, count as `skipped`, write nothing.
4. **Upsert** — `FirestoreService.upsertPrice(snapshot)` — full-overwrite `set()` with `updatedAt` server timestamp. On success set `latestBarAtCache`. Write failure → count as `failed`, log per ticker.

## Phase body — post-close finalize (16:20–16:59)

Per ticker, concurrency-limited. Skip if `finalizedCache` already holds today's `sessionDate` (already finalized this instance). Otherwise:

The finalize body is gated by `resolveFinalizeClose(ticker, cfg, today)`, which returns a discriminated `FinalizeGate` (`{ proceed: true, previousClose, officialClose }` or `{ proceed: false, outcome }`):

1. **Fetch today's official close** — `PreviousCloseResolver.resolve(...)` (widen-on-miss as in the seed). This one response yields **both** the record with `date === today` (today's official close) **and** the newest record with `date < today` (`previousClose`, in case a cold instance never seeded it). On EOD failure → `{ proceed: false, outcome: 'failed' }`.
   - **Already finalized** (`finalizedCache` holds today) → `{ proceed: false, outcome: 'skipped' }`.
   - **No record for `date === today` yet** (the ~15-min-delayed EOD not published) → `{ proceed: false, outcome: 'skipped' }`. A later run in the window retries — the finalize is **guarded on the EOD record's date, never on the clock**. On proceed, the resolver caches `previousClose` under today.
2. **Fetch today's frozen 1-min series** — `fetchIntradayBars(ticker, { from: today, to: today })` (the session is over, the series is stable). No today bars (holiday / halt) → return `skipped`.
3. **Build finalized snapshot** — `buildFinalizedSnapshot({ ..., previousClose, bucketMinutes }, officialClose)` (in `snapshot.ts`): `price` = official close; append `{ t: MARKET_CLOSE_LABEL ("16:00"), c: officialClose }` to `series` so the tip equals `price`; `change`/`changePercent` computed against `previousClose`; `latestBarAt` unchanged (still the 15:59 bar); `closeFinalized` = `true`.
4. **Upsert (bypasses the unchanged-skip)** — the finalize write must **not** consult `latestBarAtCache`: `latestBarAt` has not changed since 15:59, so the intraday skip would wrongly suppress the correction. Instead the finalize path writes unconditionally (a full-overwrite `set()`), then records `finalizedCache.set(ticker, today)` on success. Idempotent: re-running writes the same official close. Count as `written`.

---

## Step 5 — Summary log

One info line per run: `phase` + `written/skipped/failed of total` + duration in ms. Intraday duration > 45s logs at **warn** — the signal that the watchlist has outgrown the concurrency/timeout budget and `fetchConcurrency` or `maxCallsPerRun` needs tuning.

---

## Retention note

"Current session only" applies to what a write *contains*, not to when documents vanish: overnight, on weekends, and on holidays there is nothing new to write, so each document retains the last completed session's snapshot — with `closeFinalized = true`, so the overnight-displayed `price` is the **official close**. `sessionDate` tells the client which session it is looking at.

---

## Failure Isolation

| Failure | Effect |
|---|---|
| Single ticker 1-min fetch fails after retries | Logged, counted; other tickers unaffected; refreshed next run (stale ≤ 60s) |
| EOD seed fetch fails (pre-open or intraday miss) | `previousClose` not cached → next run retries; `change`/`changePercent` are `null` until it succeeds; `price`/`series` still write |
| EOD finalize fetch fails, or today's record not yet published | `finalizedCache` not set → a later finalize run retries; the doc keeps the last-trade `price` until then |
| Single document write fails | Logged, counted; the relevant skip/finalized cache not updated, so the next run rewrites it |
| Watchlist read fails after retries | Run aborts with an error log; next run retries; documents keep their last snapshot |
| FMP outage | Every run fails fast and logs; first successful run rebuilds every snapshot in full — no gap-repair or backfill |
| Function crash mid-run | Some tickers updated, some not — every document is still internally consistent (single-doc atomic writes); next run completes the rest |
| Instance restart | All in-memory caches rebuild on the next run: one EOD seed + one redundant write per ticker — negligible |
| Overlapping runs | Prevented by `maxInstances: 1`; even if two raced, both write full valid snapshots and last-write-wins is correct |
