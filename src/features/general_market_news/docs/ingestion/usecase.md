# usecase.ts

Describes `GeneralMarketNewsUseCase.execute()`. All steps run sequentially — each depends on the previous step's output. The only intra-step concurrency is the per-page FMP fetch loop (sequential by design, to stop as soon as the overlap is reached) and per-article writes (`Promise.allSettled` across the fetched batch). Nothing is fire-and-forget. Interfaces are defined in [data-models.md](data-models.md).

This is a trimmed version of [stock_news_notifier's usecase](../../../stock_news_notifier/docs/ingestion_and_messaging/usecase.md): no watchlist load, no ticker filter, no FCM step.

[← back to overview](overview.md)

---

## Steps

1. **Acquire run lease + poll-interval gate** — `FirestoreService.acquireLease(runIntervalSeconds)`, where `runIntervalSeconds` comes from `getRemoteConfig().general_market_news` (default 300s). Transaction on `general_market_news_state/ingestion` checks two conditions and fails closed on either:
   - `leaseExpiresAt > now` → another invocation is still active → log at info and return.
   - `lastRunAt + runIntervalSeconds > now` → not enough time has passed since the last attempt → log at debug and return. This is the expected outcome on most ticks once `runIntervalSeconds` exceeds the 1-minute schedule interval — no FMP call is made.

   Otherwise the transaction sets `leaseExpiresAt = now + 90s` and `lastRunAt = now` (function timeout is 60s, so a crashed run self-expires before the next minute's tick). On transaction failure: log error and return — next scheduled run retries.
2. **Read cursor** — `FirestoreService.getCursor()` → `lastPublishedDate` watermark. First run (no doc): initialize watermark to `now − overlapWindowSeconds` formatted as `"YYYY-MM-DD HH:mm:ss"` in `America/New_York`, and fetch page 0 only.
3. **Fetch since watermark** — `FmpNewsService.fetchSinceWatermark(watermark)` → `FetchResult`. Computes `overlapCutoff = watermark − overlapWindowSeconds` and fetches `/news/general-latest` pages `0..maxPages−1` (limit `pageLimit`) until the oldest item on a page is older than `overlapCutoff`. If `maxPages` is exhausted without reaching the cutoff (`reachedOverlap = false` — e.g. after FMP downtime or a news burst), it falls back to the ranged endpoint (`from=date(watermark)`, `to=today`) for up to `maxBackfillPages` pages, guaranteeing gap-free coverage. Still not caught up → log at **error** (alert signal) with the gap boundaries and continue with what was fetched. On fetch failure after retries: release lease and return **without advancing the cursor** — the next run re-covers the same window.
4. **Filter + idempotent store** — keep articles with `publishedDate ≥ overlapCutoff` (no ticker filter — every article in range is eligible). For each, `FirestoreService.createNewsIfAbsent(article)` — a `create()` on `general_market_news/{newsId}` with `newsId = sha256(url)`. `ALREADY_EXISTS` → processed by a previous run (overlap re-read) → skipped silently at debug level. Other write errors: logged per article and cause the cursor advance to be skipped for this run (see failure isolation below).
5. **Advance cursor** — `FirestoreService.advanceCursor(maxFetchedPublishedDate)`. Transaction: `lastPublishedDate = max(current, maxFetchedPublishedDate)` — monotonic, so a stale concurrent run can never move it backwards. Runs only after step 4 completed its write pass with no failures.
6. **Release lease** — `FirestoreService.releaseLease()` sets `leaseExpiresAt = now`. Best-effort; expiry covers the crash case.

---

## Failure Isolation

| Failure | Effect |
|---|---|
| FMP unreachable after retries | Cursor not advanced; next run's step 3 re-covers the window (backfill path if the outage was long) |
| Single article write fails | Logged per article; other articles unaffected |
| Any article write in a run fails (non-`ALREADY_EXISTS`) | Cursor advance is skipped for that run; next run re-fetches and the `create()` dedup absorbs the successful writes |
| Function crash mid-run | Lease expires after 90s; cursor untouched → full window reprocessed idempotently |
