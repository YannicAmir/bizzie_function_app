# usecase.ts + snapshot.ts — Run Orchestration & Derivation

`YtdPriceSyncUseCase.execute()` owns only the run *sequence* (resolve dates → load watchlist → per-ticker workflow → summary). The pure baseline/latest/change derivation lives in `snapshot.ts` (`buildYtdSnapshot`) so it is unit-testable without FMP or Firestore. Interfaces are in [data-models.md](data-models.md).

[← back to overview](overview.md)

---

## `execute()` steps

1. `now = Date.now()`. Derive `today = todayEasternDate(now)` and `year = Number(today.slice(0, 4))` (both via [core/date_utils](../../../../core/date_utils.ts)).
2. `cfg = (await getRemoteConfig()).ytd_price_change`.
3. **Load watchlist** — `retry(() => watchlistService.getAllWatchedTickers(cfg.watchlistCacheSeconds), WATCHLIST_RETRY_OPTIONS)` (3 attempts, 1 s initial, ×2 — same options as `stock_price_sync`). On exhausted retries: log and return (the next fire is the retry). If the map is empty: log `No tickers watched` and return.
4. **Fetch window** (computed once for the whole run): `from = subtractCalendarDays(`${year}-01-01`, cfg.baselineLookbackCalendarDays)` — default 15 → mid-December of the prior year, guaranteeing the prior-year final close is in range across the holiday break; `to = today`.
5. **Process watchlist** — `runWithConcurrency(entries, cfg.fetchConcurrency, processTicker)` over **every** `[ticker, companyName]` (no cohort sharding — the whole list every run). Each `processTicker` is wrapped so its outcome is tallied and a thrown error is caught and counted `failed` — one ticker never aborts the run.
6. `logRunSummary()` — `written / skipped / failed of N (durationMs)`; warn if `durationMs > RUN_DURATION_WARN_MS`.

## `processTicker(ctx)` → `'written' | 'skipped' | 'failed'`

| Step | Action | Failure |
|---|---|---|
| a | `closes = await fmpEodService.fetchDailyCloses(ticker, window)` | throw → `failed` (logged; next fire retries) |
| b | `snapshot = buildYtdSnapshot(ticker, companyName, year, closes)` | `null` → `skipped` (existing doc left untouched) |
| c | `await firestoreService.upsertYtd(snapshot)` → `written` | throw → `failed` |

There is **no in-memory unchanged-skip cache**: at four runs/day the write volume is trivial and every run legitimately produces a fresh `latestClose`, so the skip machinery `stock_price_sync` needs (198k intraday writes/day) would earn nothing here (see [design-decisions.md](design-decisions.md)).

---

## `buildYtdSnapshot(ticker, companyName, year, closes)` — pure (`snapshot.ts`)

Returns `YtdChangeSnapshot | null`. All date comparisons are lexicographic on `"YYYY-MM-DD"` strings (no `Date` parsing).

1. If `closes` is empty → return `null`.
2. **Baseline.** `baseline = latestCloseBefore(closes, `${year}-01-01`) ?? closeWithMinDate(closes)` — the close on the greatest date `< Jan 1` (the prior-year final close), or, when the ticker has no prior-year record (it first listed this year), the earliest close in the series (its first current-year session). Only if there is *no* usable close at all, or `baselineClose === 0`, return `null` (skipped, no doc written; guards divide-by-zero). The fallback ensures mid-year watchlist additions still receive a document.
3. **Latest.** `latest = closeWithMaxDate(closes)` — the newest record (`≤ today`; includes today's row intraday). If none → return `null`.
4. `ytdChange = latestClose − baselineClose`; `ytdChangePercent = ytdChange / baselineClose × 100`.
5. Return the fully populated `YtdChangeSnapshot` (no `updatedAt` — the Firestore service stamps that).
