# Design Decisions — Evaluation of the Original Plan

The original plan: scheduler reads the watchlist → publishes one Pub/Sub message per ticker → a subscriber function pulls tickers off the topic and makes the per-ticker FMP call, "in case of failures". The per-ticker fan-out itself is forced (the 1-min chart endpoint is single-symbol and the batch quote endpoints are not on the current FMP plan) — the plan correctly identified that constraint. **The Pub/Sub layer, however, is rejected.** This doc records why, and the alternatives that were weighed.

[← back to overview](overview.md)

---

## The keystone property: every run is a disposable full snapshot

Each run fetches the *entire* day window per ticker and *fully overwrites* the document. No run depends on any previous run having succeeded. That one property answers the failure question the Pub/Sub layer was meant to solve:

> A failed ticker, a failed run, or a two-hour outage requires **zero** recovery work — the next successful run rebuilds every document identically to what an unbroken history would have produced. There is nothing to retry because there is nothing lost.

Contrast with `weekly_recap`, where Pub/Sub *is* justified: each message triggers minutes of expensive LLM work on a weekly cadence — a lost company is a lost recap for the whole week, so durable delivery and a dead-letter queue earn their complexity. Here the unit of work is a ~300ms HTTP GET refreshed 390 times a day; losing one costs 60 seconds of staleness.

---

## Why Pub/Sub is rejected here

| Concern | Analysis |
|---|---|
| **Retries are anti-value** | A redelivered ticker message executes minutes after the failure — delivering data that the *next scheduled run has already superseded*. Every retry is wasted work racing a fresher full refresh. |
| **It makes rate limiting worse, not better** | The real production risk is the FMP per-minute quota, and Pub/Sub fan-out removes the one control that manages it: with N messages spraying across auto-scaled subscriber instances, aggregate FMP concurrency is unbounded → thundering-herd 429s. A single function with a `fetchConcurrency` limit and the `maxCallsPerRun` cohort throttle gives precise, Remote-Config-tunable control. Reconstructing that under Pub/Sub means wrestling max-instances × per-instance-concurrency — more knobs to approximate what `p-limit` gives in one line. |
| **Cost and operational noise** | ~500 publishes + ~500 subscriber invocations per minute ≈ **720k invocations/day** (plus topic, subscription, DLQ, and their monitoring) vs **481 invocations/day** for the single function. |
| **Duplicate/ordering hazards for free** | At-least-once delivery means a duplicate or late message can overwrite a fresher snapshot with a staler one unless writes carry version guards — complexity spent defending against a problem the architecture itself introduced. |

**When to revisit:** if per-ticker work ever becomes expensive and loss-intolerant (e.g. LLM enrichment per price move) or the cadence stretches to where a missed unit isn't naturally superseded — then the `weekly_recap` pattern applies. For a stateless per-minute refresh it is scaffolding around a problem that doesn't exist.

---

## Other Decisions

**Official close from the EOD endpoint, not the 1-min last bar.** The `historical-chart/1min` endpoint's final regular-session bar is **15:59** (trades 15:59:00–15:59:59); there is no 16:00 bar because the **closing auction / cross prints separately**. Its close is a last-trade price, and the closing cross — which concentrates large volume at a single price — routinely differs. Deriving `price` at/after the close, or `previousClose`, from a 1-min bar therefore bakes an auction delta into every ticker every day (confirmed end-to-end: the 15:59 close differs from the same day's EOD `price`). The fix sources the official close from `historical-price-eod/light`, whose `price` is the official close. This drives two changes: **(1)** `previousClose` = the prior session's EOD close (see the seed decision below, now superseded to use EOD); **(2)** a **post-close finalize** pass overwrites today's `price` with the official close. The EOD endpoint is **~15-min delayed** (today's record appears ~16:15 ET), so finalize runs from **4:20pm** and is **guarded on `EOD.date === today`, not on the clock** — it no-ops and retries until the record publishes, then self-disables via an in-memory `finalizedCache` marker. There is **no bulk/batch EOD** on the plan (confirmed), so EOD stays per-ticker — but at ≤ 2 calls/ticker/day the cost is a rounding error.

**Finalize must bypass the unchanged-skip.** The intraday write is suppressed when the snapshot's `latestBarAt` equals the cached value. The finalize write changes `price` **without a new bar** — `latestBarAt` is still 15:59 — so routing it through the same skip check would silently drop the correction. Finalize therefore writes unconditionally (still a full-overwrite `set()`, still idempotent) and tracks completion in a separate `finalizedCache`, not in `latestBarAtCache`. This is the subtlest hazard in the design and the reason finalize is a distinct phase rather than "just another snapshot."

**Series tip stays equal to `price` after finalize.** Rather than relax the "tip == price" invariant, the finalize step appends one synthetic `{ t: "16:00", c: officialClose }` point to the downsampled `series`. Cosmetic on a mini sparkline, but it keeps the document self-consistent so the front end never has to special-case the finalized doc.

**Full-session snapshot fetch instead of accumulating quote ticks.** The natural alternative — poll a quote endpoint each minute and append points to build the chart — is unavailable (quote endpoints not on the current plan, confirmed 2026-07-16) and would be worse anyway: an accumulated series has gaps whenever a run is missed and needs seed/backfill logic for new tickers. Refetching the whole session makes the FMP response the single source of truth every minute. *If the plan ever gains `batch-quote`,* the right move is not accumulation but swapping `fmp_chart_service` for a ~2-calls-per-run batch fetch for the `price/change` fields while keeping this pipeline at a lower cadence for the `series` — the document shape already supports that split.

**Intraday today-only fetch window, driven by the confirmed 500 GB/30-day bandwidth cap.** Fetching a multi-day 1-min lookback window every minute would cost ~570 GB/30d at 500 tickers — over the plan's cap. Instead every 1-min call fetches `from = to = today` (0→43 KB payloads, ~92 GB/30d ≈ 18% of cap). `previousClose` no longer rides on this endpoint at all — it comes from the EOD endpoint (next decision).

**Prior-session close from EOD, narrow window + widen-on-miss, no holiday-calendar dependency (supersedes the 1-min seed).** `previousClose` = the `price` of the newest EOD record with `date < today`, from one windowed `historical-price-eod/light` fetch per ticker per day, cached in memory keyed by session date (including `null`, so it runs at most once per ticker per day). The window is **narrow** (`today − eodLookbackCalendarDays`, default 4 — spans a long weekend) with a **widen-on-miss** retry (`today − eodFallbackCalendarDays`, default 10) when no record precedes today (a Thanksgiving/Christmas cluster). Because EOD is daily-grained, **closed days are simply absent** from the response, so "newest record before today" is always the correct prior session — the market data is the calendar. *Rejected alternative:* a holiday-calendar package — generic ones (`date-holidays`) are actively wrong for NYSE (closed Good Friday, open Columbus/Veterans Day) and none predict ad-hoc closures. *Retired:* the former weekday-aware **1-min** seed (narrow `today−3`/`today−1` + widen-on-miss). It worked, but its close was the skewed 15:59 last-trade price and it was more code than the EOD lookup — EOD is both more accurate and simpler, so the 1-min seed and its `seedFallbackCalendarDays` knob are deleted.

**No lease, no state document.** `stock_news_notifier` needs a transactional lease because it protects a *cursor* — corruptible state. This pipeline has none: overlapping runs would both write complete valid snapshots and last-write-wins is correct. `maxInstances: 1` alone is sufficient, and the lease machinery is deliberately omitted.

**One document per ticker with an embedded `series` array, not a subcollection of points.** The client needs the whole sparkline at once; one doc = one read, atomic replace. A points subcollection would cost one read per point per chart render and reintroduce partial-state windows during writes.

**Series downsampled server-side to 5-minute buckets.** A mini sparkline has fewer horizontal pixels than a session has 1-min bars, so storing all ~390 bars ships ~5× the bytes for zero visual gain. Each `seriesBucketMinutes` (default 5) bucket contributes its newest bar (`{t, c}`), in-progress bucket included so the series tip equals `price`; ~79 points ≈ 2 KB per doc. `price`/`latestBarAt` always come from the newest raw 1-min bar, so row freshness is unaffected. A future full-resolution detail chart should fetch FMP on demand or lower the knob — this document serves the watchlist row.

**Full-overwrite `set()` with unchanged-skip, not merge/append.** Overwrite is what makes the write idempotent; the in-memory `latestBarAt` check (not a Firestore read — reads would cost more than they save) suppresses writes whenever no new bar has arrived (holidays, FMP data stalls).

**Orchestration decomposed; one shared FMP client.** `usecase.ts` owns only the run *sequence* (gate → load → shard → per-ticker workflow → summary); the separable policies live in focused modules — `phase.ts` (gate), `cohort.ts` (sharding), `previous_close.ts` (`PreviousCloseResolver`: EOD windowing/fallback + the warm `previousClose` cache, injected so it is swappable/mockable), `snapshot.ts` (pure `buildIntradaySnapshot`/`buildFinalizedSnapshot`), and core `concurrency.ts` (`runWithConcurrency`). On the transport side, both FMP endpoints are single-symbol windowed GETs with identical retry/timeout/transient needs, so that machinery is centralized in `services/fmp_client.ts` and each service (`fmp_chart_service`, `fmp_eod_service`) is just a typed `FmpEndpoint` descriptor + a `parseRow`. This keeps every unit small and single-responsibility (the QA audit checks for `execute()` re-absorbing a step), and puts FMP resilience in exactly one place ([fmp-client.md](fmp-client.md)).

**Cron `* 9-16 * * 1-5` plus an in-code phase gate (single function, three phases).** A single cron expression cannot express 9:15 / 9:30 / 4:05 / 4:20 boundaries, so the gate (first step of the use case) routes each minute into pre-open EOD seed, intraday, post-close finalize, or idle — a gated-idle exit costs milliseconds and zero FMP calls. *One function, not two:* the finalize pass could be a separate scheduled function, but keeping it in the same use case shares the per-ticker concurrency/error-isolation harness, the FMP/Firestore services, one log stream, and one kill switch; the phases are mutually exclusive in time, so there is no contention. No extended-hours data on the plan, so there is no premarket window to consider (resolved in [tech-stack.md](tech-stack.md)).

**Current session only in Firestore; documents never blanked.** `series` never contains more than today's bars (plus the synthetic 16:00 close point after finalize). Outside market hours the document retains the last completed session — now with `closeFinalized = true`, so the overnight-displayed `price` is the official close, not the 15:59 last trade. Blanking would spend writes to destroy the only data there is to show; `sessionDate` tells the client which session it is looking at.

---

## Consistency Guarantees (summary)

- **Documents:** always internally consistent — single-doc atomic full overwrite; never a partially-updated snapshot.
- **Freshness:** ≤ 60s behind the FMP feed during market hours (× `numCohorts` when throttled) — self-labeling via `latestBarAt`/`updatedAt`.
- **Recovery:** unconditional — any failure heals on the next successful run with no operator action, no backfill, no queue drain.
