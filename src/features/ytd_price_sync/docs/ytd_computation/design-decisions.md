# Design Decisions

This feature is deliberately a *stripped-down* [stock_price_sync](../../../stock_price_sync/docs/price_ingestion/design-decisions.md). It reuses that pipeline's keystone property but sheds every piece of machinery that property makes unnecessary at a four-times-a-day cadence. This doc records what was kept, what was dropped, and why.

[← back to overview](overview.md)

---

## The keystone property: every run is a disposable full recompute

Each run fetches the *entire* year window per ticker and *fully overwrites* `ytd_price_change/{ticker}`. No run depends on any previous run having succeeded.

> A failed ticker, a failed run, or a multi-hour outage requires **zero** recovery work — the next successful fire rebuilds every document identically to what an unbroken history would have produced. There is nothing to retry because there is nothing lost.

This is the same property `stock_price_sync` rests on, so the same conclusion follows: **no Pub/Sub fan-out, no queue, no dead-letter, no cursor, no lease.** The rejection analysis in that feature's [design-decisions.md](../../../stock_price_sync/docs/price_ingestion/design-decisions.md#why-pubsub-is-rejected-here) applies verbatim and is not repeated here.

---

## Baseline = prior-year final close

`ytdChange` measures the move from the **prior trading year's official final close** — the newest EOD record with `date < `${year}-01-01``. This is the standard financial YTD convention (performance "since year-end"), not the first-session-of-year open. The single fetch window is widened to mid-December of the prior year (`baselineLookbackCalendarDays`, default 15) so that record is always present; because EOD records are daily-grained, **closed days are simply absent**, so "newest record before Jan 1" is always the correct prior-year close with **zero holiday-calendar dependency** — the market data is the calendar (same reasoning as `stock_price_sync`'s previous-close lookup).

**Baseline with a first-session fallback.** The baseline is normally the prior-year final close. A ticker that first listed **in the current year** has no prior-year record, so the baseline **falls back to the first available close of the current year** (its first session). This is a deliberate product decision: the global watchlist may gain mid-year listings, and every watchlisted company must be backed by a `ytd_price_change` document so the front end renders a consistent figure for all rows — skipping current-year listings would leave those rows blank. The fallback keeps the **document shape identical** (no `baselineSource` discriminator field); for a mid-year listing the number reads as "since first session" rather than "since year-end", which is the natural YTD for a company that did not trade last year. The wide fetch window (mid-December → today) already contains the first current-year close, so no extra fetch is needed.

---

## "Current" = latest EOD-light record, not a live quote

The EOD-light endpoint **includes today's row during the session** (~15-min delayed on the Enterprise plan; verified an AAPL call at 12:36 ET on 2026-07-21 returned a same-day row). So a single endpoint supplies both ends of the calculation, and every fire during the session advances `latestClose`. *Rejected:* reading the live intraday price `stock_price_sync` already writes to `stock_prices/{ticker}` — it would couple the two features and add a second data source for a ~15-minute freshness gain that a YTD figure does not need.

---

## No lease, no cohort, no phase gate

Three pieces of `stock_price_sync` machinery are deliberately **absent**:

| Dropped | Why it existed there | Why it is unnecessary here |
|---|---|---|
| **Phase gate** (`phase.ts`) | One cron couldn't express 9:15 / 9:30 / 4:05 / 4:20 boundaries, so an in-code gate routed each minute | The schedule *is* the policy — a plain every-10-minute fire, each running the identical full pipeline. Cron expresses it directly. |
| **Cohort sharding** (`cohort.ts`, `maxCallsPerRun`) | Per-minute runs could round-robin the watchlist across runs to throttle FMP | This runs **4×/day**; sharding across runs would leave tickers stale for *hours*. The whole watchlist must be processed every fire — a single ~500-call burst is well within the 1,500/min quota, so no throttle is needed. |
| **Previous-close warm cache** (`previous_close.ts`) | The intraday loop needed `previousClose` on every minute without re-fetching | The baseline comes from the *same* single fetch as the latest close; there is nothing to cache across runs. |

`maxInstances: 1` plus last-write-wins is sufficient — overlapping runs would both write complete valid snapshots, so no transactional lease is warranted (same conclusion as `stock_price_sync`).

---

## No unchanged-skip cache

`stock_price_sync` suppresses writes when the newest 1-min bar is unchanged because it fires ~390×/day (≈198k potential writes). Here the ceiling is `watchlist × 144 ≈ 72k writes/day`; during the session every fire produces a fresh `latestClose`, and off-session fires rewrite an identical snapshot cheaply. An unchanged-skip cache would trim the off-hours writes but adds cross-run state for a Firestore cost that is still negligible, so it is omitted — revisit if write volume ever matters.

---

## Feature-local FMP client, not a shared `core/` client

The windowed-GET client (`services/fmp_client.ts`) is copied into this feature rather than promoted to `src/core` and shared with `stock_price_sync`. This matches the established convention (each feature owns its `services/`) and keeps the feature self-contained and independently deployable. The duplication is ~50 lines of stable transport code; extracting a shared client is a cross-feature refactor deferred until a third consumer appears.

---

## Consistency Guarantees (summary)

- **Documents:** always internally consistent — single-doc atomic full overwrite; never a partially-updated snapshot.
- **Freshness:** each fire reflects the FMP EOD series at fetch time (~15 min behind intraday); `updatedAt` / `latestDate` self-label it.
- **Recovery:** unconditional — any failure heals on the next successful fire with no operator action, no backfill, no queue drain.
