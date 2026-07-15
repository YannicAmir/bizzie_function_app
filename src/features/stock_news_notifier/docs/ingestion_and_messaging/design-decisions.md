# Design Decisions — Evaluation of the Original Plan

The original plan (poll every minute → filter by watchlist → store with 3-day TTL → FCM topic notify, with dedup and gap-free paging) is architecturally sound and matches existing patterns (`realtime_8k_notifier`). This doc records what was hardened and why, and the alternatives that were weighed.

[← back to overview](overview.md)

---

## Hardening Applied

| Weakness in the original plan | Hardening |
|---|---|
| "Not already processed" was underspecified | Deterministic doc ID `sha256(symbol\|url)` + `create()` — the write itself is the dedup check (one op, race-free), pattern proven in `filing_history_service.ts` |
| "No gaps" via ad-hoc page/limit tuning | Explicit cursor (`lastPublishedDate` high-water mark) + overlap window + page-until-overlap + ranged `from`/`to` backfill when `maxPages` is exceeded — deterministic guarantee instead of heuristics |
| Overlapping runs (a slow run colliding with the next tick) | `maxInstances: 1` + 90s Firestore lease; and because writes are idempotent and the cursor is monotonic (`max()` in a transaction), even a lease failure cannot corrupt state |
| Notification spam on hot tickers | Per-run coalescing ("N new stories") + per-ticker cooldown claimed transactionally + APNS/Android collapse id |
| Crash between store and notify → double push | Cooldown claim happens *before* send in a transaction: worst case is one missed push, never a duplicate |
| Clock skew / late-published articles | Overlap window re-reads 5 min behind the cursor; dedup absorbs the re-reads |
| Full watchlist read every minute | Per-instance cache (default 5 min) |
| No off switch at ~1,200 runs/day | Pause the Cloud Scheduler job in the GCP console (cursor makes resume gap-free); all tuning knobs in Remote Config |

---

## Pros / Cons of the Chosen Approach

**FCM topics (topic = ticker)** — *Pros:* zero server-side token management; one send per ticker regardless of subscriber count; convention already live in `realtime_8k_notifier`, so clients already subscribe. *Cons:* no per-user preferences, quiet hours, or premium gating; no delivery receipts; subscription drift if the client forgets to resubscribe on token rotation.

**Firestore TTL for the 3-day expiry** — *Pros:* fully managed, no cleanup function. *Cons:* deletion lands up to 24h late, so clients must filter `expireAt > now`; TTL policy is per-environment infra ([ttl-setup.md](ttl-setup.md)). *Rejected alternative:* scheduled cleanup function — exact timing, but more code and another failure mode for no user-visible benefit.

**Store only watchlisted articles** — *Pros:* write volume proportional to user interest; TTL keeps the collection tiny. *Cons:* a ticker added to a watchlist has no news history until the next matching article; if backfill-on-subscribe is wanted later, it belongs in a separate on-demand feature, not this poller.

---

## Consistency Guarantees (summary)

- **Storage:** exactly-once *effect* — at-least-once fetch + idempotent `create()`.
- **Notifications:** at-most-once per ticker per cooldown window — transactional claim-before-send.
- **Coverage:** no gaps — cursor only advances over fetched data; failed runs re-cover; deep gaps route through ranged backfill; unrecoverable depth logs at error for alerting.
