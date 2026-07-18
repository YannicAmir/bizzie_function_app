# usecase.ts

Describes `StockNewsNotifierUseCase.execute()`. All steps run sequentially — each depends on the previous step's output. The only intra-step concurrency is the per-page FMP fetch loop (sequential by design, to stop as soon as the overlap is reached) and per-article writes (`Promise.allSettled` within one ticker batch). Nothing is fire-and-forget. Interfaces are defined in [data-models.md](data-models.md).

[← back to overview](overview.md)

---

## Steps

1. **Acquire run lease** — `FirestoreService.acquireLease()`. Transaction on `stock_news_notifier_state/ingestion`: if `leaseExpiresAt > now`, another invocation is still active → log at info and return. Otherwise set `leaseExpiresAt = now + 90s` (function timeout is 60s, so a crashed run self-expires before two ticks pass). On transaction failure: log error and return — next minute retries.
2. **Load watched tickers** — core `FirebaseWatchlistService.getAllWatchedTickers()` → `Map<ticker, companyName>` from `watchlist/{ticker}`. Cached at module scope for `stock_news.watchlistCacheSeconds` (default 300s) to avoid a full collection read every minute. Empty map → release lease and return.
3. **Read cursor** — `FirestoreService.getCursor()` → `lastPublishedDate` watermark. First run (no doc): initialize watermark to `now − overlapWindowSeconds` formatted as `"YYYY-MM-DD HH:mm:ss"` in `America/New_York`, and fetch page 0 only.
4. **Fetch since watermark** — `FmpNewsService.fetchSinceWatermark(watermark)` → `FetchResult`. Computes `overlapCutoff = watermark − overlapWindowSeconds` and fetches `/news/stock-latest` pages `0..maxPages−1` (limit `pageLimit`) until the oldest item on a page is older than `overlapCutoff`. If `maxPages` is exhausted without reaching the cutoff (`reachedOverlap = false` — e.g. after FMP downtime or a burst), it falls back to the ranged endpoint (`from=date(watermark)`, `to=today`) for up to `maxBackfillPages` pages, guaranteeing gap-free coverage. Still not caught up → log at **error** (alert signal) with the gap boundaries and continue with what was fetched. On fetch failure after retries: release lease and return **without advancing the cursor** — the next run re-covers the same window.
5. **Filter + idempotent store** — keep articles with `publishedDate ≥ overlapCutoff` and `symbol` in the watchlist map. For each, `FirestoreService.createNewsIfAbsent(article)` — a `create()` on `stock_news/{newsId}` with `newsId = sha256("{symbol}|{url}")`. `ALREADY_EXISTS` → processed by a previous run (overlap re-read) → excluded from notification. Other write errors: logged per article; the article is dropped from notification but the cursor still advances only in step 7 based on what was *fetched*, so a transient write failure surfaces as an error log, not a silent gap (see failure isolation below).
6. **Notify per ticker** — group freshly-created articles by `symbol`. For each ticker, `FirestoreService.claimNotificationSlot(ticker)` — transaction on `stock_news_cooldowns/{ticker}`: proceed only if `lastNotifiedAt + notificationCooldownSeconds ≤ now`, updating `lastNotifiedAt` in the same transaction (claim-before-send: a crash after the claim loses at most one notification; it never double-sends). On a successful claim, `FcmService.sendNewsNotification(...)`:
   - 1 article → title `"{ticker} News"`, body = article title.
   - N articles → title `"{ticker}: {N} new stories"`, body = newest article title + `"... and more"` (title truncated so the full body stays ≤ 178 chars with the suffix intact).
   - Suppressed tickers (cooldown active) are stored but not notified — the app feed still shows them.
7. **Advance cursor** — `FirestoreService.advanceCursor(maxFetchedPublishedDate)`. Transaction: `lastPublishedDate = max(current, maxFetchedPublishedDate)` — monotonic, so a stale concurrent run can never move it backwards. Runs only after step 5 completed its write pass.
8. **Release lease** — `FirestoreService.releaseLease()` sets `leaseExpiresAt = now`. Best-effort; expiry covers the crash case.

---

## Failure Isolation

| Failure | Effect |
|---|---|
| FMP unreachable after retries | Cursor not advanced; next run's step 4 re-covers the window (backfill path if the outage was long) |
| Single article write fails | Logged per article; other articles and tickers unaffected |
| Any article write in a run fails (non-`ALREADY_EXISTS`) | Cursor advance is skipped for that run; next run re-fetches and the `create()` dedup absorbs the successful writes |
| FCM send fails | Logged and swallowed (matches core `NotificationService` convention); storage already succeeded |
| Function crash mid-run | Lease expires after 90s; cursor untouched → full window reprocessed idempotently |
