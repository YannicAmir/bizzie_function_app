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

**Full-session snapshot fetch instead of accumulating quote ticks.** The natural alternative — poll a quote endpoint each minute and append points to build the chart — is unavailable (quote endpoints not on the current plan, confirmed 2026-07-16) and would be worse anyway: an accumulated series has gaps whenever a run is missed and needs seed/backfill logic for new tickers. Refetching the whole session makes the FMP response the single source of truth every minute. *If the plan ever gains `batch-quote`,* the right move is not accumulation but swapping `fmp_chart_service` for a ~2-calls-per-run batch fetch for the `price/change` fields while keeping this pipeline at a lower cadence for the `series` — the document shape already supports that split.

**Two-mode fetch window, driven by the confirmed 500 GB/30-day bandwidth cap.** Fetching a multi-day lookback window every minute (the simplest way to get `previousClose` in the same call) would cost ~570 GB/30d at 500 tickers — over the plan's cap. Instead, ~99% of calls fetch `from = to = today` (0→43 KB payloads, ~92 GB/30d ≈ 18% of cap), and `previousClose` comes from **one seed fetch per ticker per day** on the same endpoint, cached in memory keyed by session date — including when the result is `null` or today has no bars yet, so holidays cost one seed sequence, not one per minute. Caveat: the prior session's final 1-min bar close can differ from the official consolidated close by a cent or two — acceptable for a watchlist row.

**Seed window: weekday-aware narrow fetch + widen-on-miss fallback, no holiday-calendar dependency.** The narrow seed reaches exactly one calendar step back (`today − 3` on Mondays to span the weekend, `today − 1` otherwise, ~45 KB); if the response contains no session before today — which is precisely what "yesterday was closed" looks like in the data — one widened retry (`today − seedFallbackCalendarDays`, default 6) recovers it. *Rejected alternative:* a holiday-calendar package. Generic ones (`date-holidays`) are actively wrong for NYSE — markets close on Good Friday (not a federal holiday) but open on Columbus Day and Veterans Day (federal holidays) — and even an NYSE-specific package cannot predict ad-hoc closures (presidential funerals, 9/11), failing exactly on the days it exists for. The widen-on-miss fallback uses the market data itself as the calendar, so it is always right, costs one extra call per ticker on only ~9 post-holiday mornings a year, and carries zero dependencies. *Also-rejected:* the original fixed 4-day seed window — correct and simpler, but fetches ~3× the needed payload every day (~65–85 MB/day vs ~25); the weekday rule removes the predictable waste for one small branch.

**No lease, no state document.** `stock_news_notifier` needs a transactional lease because it protects a *cursor* — corruptible state. This pipeline has none: overlapping runs would both write complete valid snapshots and last-write-wins is correct. `maxInstances: 1` alone is sufficient, and the lease machinery is deliberately omitted.

**One document per ticker with an embedded `series` array, not a subcollection of points.** The client needs the whole sparkline at once; one doc = one read, atomic replace. A points subcollection would cost one read per point per chart render and reintroduce partial-state windows during writes.

**Series downsampled server-side to 5-minute buckets.** A mini sparkline has fewer horizontal pixels than a session has 1-min bars, so storing all ~390 bars ships ~5× the bytes for zero visual gain. Each `seriesBucketMinutes` (default 5) bucket contributes its newest bar (`{t, c}`), in-progress bucket included so the series tip equals `price`; ~79 points ≈ 2 KB per doc. `price`/`latestBarAt` always come from the newest raw 1-min bar, so row freshness is unaffected. A future full-resolution detail chart should fetch FMP on demand or lower the knob — this document serves the watchlist row.

**Full-overwrite `set()` with unchanged-skip, not merge/append.** Overwrite is what makes the write idempotent; the in-memory `latestBarAt` check (not a Firestore read — reads would cost more than they save) suppresses writes whenever no new bar has arrived (holidays, FMP data stalls).

**Cron `* 9-16 * * 1-5` plus an in-code gate to 9:30am–4:05pm ET.** A single cron expression cannot express these boundaries, so the gate (first step of the use case) trims the edges — a gated exit costs milliseconds and zero FMP calls. The 1-min endpoint is near-real-time, so the window opens with the session and the 4:05pm final run captures the complete session including the close. No extended-hours data on the plan, so there is no premarket window to consider (resolved in [tech-stack.md](tech-stack.md)).

**Current session only in Firestore; documents never blanked.** `series` never contains more than today's bars. Outside market hours the document retains the last completed session and the front end simply renders the latest available data (resolved decision) — blanking would spend writes to destroy the only data there is to show; `sessionDate` tells the client which session it is looking at.

---

## Consistency Guarantees (summary)

- **Documents:** always internally consistent — single-doc atomic full overwrite; never a partially-updated snapshot.
- **Freshness:** ≤ 60s behind the FMP feed during market hours (× `numCohorts` when throttled) — self-labeling via `latestBarAt`/`updatedAt`.
- **Recovery:** unconditional — any failure heals on the next successful run with no operator action, no backfill, no queue drain.
