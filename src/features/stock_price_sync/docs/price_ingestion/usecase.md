# usecase.ts

Describes `StockPriceSyncUseCase.execute()`. Steps 1–3 run sequentially; step 4 processes tickers concurrently under a `fetchConcurrency` limit with per-ticker error isolation (`Promise.allSettled` semantics — one ticker's failure never affects another). Nothing is fire-and-forget. Interfaces are defined in [data-models.md](data-models.md).

[← back to overview](overview.md)

---

## Steps

1. **Market-window gate** — compute the current time in `America/New_York`; outside **9:30am–4:05pm** log at debug and return. The cron (`* 9-16 * * 1-5`) cannot express these boundaries, so the gate trims the edges. Bars are near-real-time, and the 4:05pm final run captures the complete session including the close (see [trigger.md](trigger.md)).

2. **Load watched tickers** — core `FirebaseWatchlistService.getAllWatchedTickers()` → `Map<ticker, companyName>` from `watchlist/{ticker}`. Cached at module scope for `stock_prices.watchlistCacheSeconds` (default 300s) to avoid a full collection read every minute. Empty map → log at info and return. Fetch failure after retries → log error and return; the next minute retries.

3. **Select cohort** — if `stock_prices.maxCallsPerRun` is `0` (default — the Enterprise plan's 1,500 calls/min leaves ~3× headroom at 500 tickers), process every ticker. Otherwise compute `numCohorts = ceil(watchlistSize / maxCallsPerRun)`, sort tickers alphabetically, and keep tickers where `index % numCohorts === minuteOfDay % numCohorts` (interleaved slicing keeps cohorts balanced as the watchlist grows). Deterministic and stateless: every ticker is refreshed every `numCohorts` minutes with no coordination state.

4. **Per ticker** (concurrency limited to `stock_prices.fetchConcurrency`, default 8):
   1. **Resolve previous close & fetch** — module-scope cache `Map<ticker, { sessionDate, previousClose }>`:
      - **Cache hit for today** → *today-only fetch*: `FmpChartService.fetchIntradayBars(ticker, { from: today, to: today })`.
      - **Cache miss** (first run of the day, cold instance, new ticker) → *narrow seed fetch*: `from = today − 3` on Mondays (reaching Friday), `from = today − 1` Tue–Fri. If the response contains **no session before today** (yesterday was a market holiday or ad-hoc closure), retry once *widened*: `from = today − seedFallbackCalendarDays` (default 6). Derive `previousClose` = final bar close of the latest session **before** today (`null` if still none), and cache the outcome under today's `sessionDate` — including when it is `null` or today has no bars yet, so at most **one seed sequence per ticker per day** (holidays included).
      - Fetch failure after retries → count as `failed`, log per ticker, continue; the ticker is stale for ≤ 60s until the next run (a failed seed is retried on the next run because nothing was cached).
   2. **Build snapshot** — pure function `buildSnapshot(ticker, companyName, bars, previousClose)`:
      - Keep only bars whose `"YYYY-MM-DD"` date prefix equals **today's** ET date. No today bars → return `null` (skip ticker with a debug log — holiday, new listing, or FMP data gap; the existing document is left untouched, see retention note below).
      - Sort ascending by `date` (the FMP `"YYYY-MM-DD HH:mm:ss"` ET format sorts lexicographically; FMP returns newest-first).
      - `sessionDate` = today; `price` = last bar's close; `latestBarAt` = last bar's `date` — always from the newest raw 1-min bar.
      - `change` / `changePercent` derived from `price` and `previousClose`; both `null` when `previousClose` is `null` or `0`.
      - `series` = the bars **downsampled** into `stock_prices.seriesBucketMinutes` buckets (default 5): bucket index = floor(minutes-since-midnight ÷ bucket size); each bucket contributes one `{t, c}` point from its newest bar, in-progress bucket included — so the series tip always equals `price`. ~79 points per full session at 5-min buckets (see [data-models.md](data-models.md)).
   3. **Skip if unchanged** — module-scope `Map<ticker, latestBarAt>`: if the snapshot's `latestBarAt` equals the cached value, count as `skipped` and write nothing (the cache entry is set only after a successful write, so a failed write is retried next run). A cold instance simply rewrites each ticker once — harmless.
   4. **Upsert** — `FirestoreService.upsertPrice(snapshot)` — full-overwrite `set()` on `stock_prices/{ticker}` with `updatedAt` server timestamp. Write failure → count as `failed`, log per ticker; the next run rewrites the complete snapshot.

5. **Summary log** — one info line: `written/skipped/failed of total` plus run duration in ms. Duration > 45s logs at **warn** — the signal that the watchlist has outgrown the concurrency/timeout budget and `fetchConcurrency` or `maxCallsPerRun` needs tuning.

---

## Retention note

"Current session only" applies to what a write *contains*, not to when documents vanish: overnight, on weekends, and on holidays there is nothing new to write, so each document retains the last completed session's snapshot and the front end simply renders the latest available data (resolved decision in [tech-stack.md](tech-stack.md)). `sessionDate` tells the client which session it is looking at.

---

## Failure Isolation

| Failure | Effect |
|---|---|
| Single ticker FMP fetch fails after retries | Logged, counted; other tickers unaffected; ticker refreshed by the next run (stale ≤ 60s) |
| Seed fetch fails | `previousClose` not cached → next run retries the seed; ticker skipped this run |
| Single document write fails | Logged, counted; unchanged-skip cache not updated, so the next run rewrites it |
| Watchlist read fails after retries | Run aborts with an error log; next minute retries; documents keep their last snapshot |
| FMP outage | Every run fails fast and logs; first successful run rebuilds every snapshot in full — no gap-repair or backfill needed |
| Function crash mid-run | Some tickers updated, some not — every document is still internally consistent (single-doc writes are atomic); next run completes the rest |
| Instance restart | Both in-memory caches (`previousClose`, `latestBarAt`) rebuild on the next run: one seed fetch + one redundant write per ticker (~25 MB, ~500 writes) — negligible |
| Overlapping runs | Prevented by `maxInstances: 1`; even if two runs raced, both write full valid snapshots and last-write-wins is correct (newer fetch ⊇ older fetch) |
