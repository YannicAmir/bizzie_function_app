# Running the Weekly Recap Retrieval & Messaging Pipeline in Dev

How to manually trigger the pipeline from the Firebase shell against real dev infrastructure.

---

## Before You Start — Confirm You Are on Dev

```bash
firebase use
```

Expected output: `bizzie-dev-7199b`. If not, switch:

```bash
firebase use dev
```

Never run shell commands against `qa` or `prod`.

---

## Prerequisites

| Requirement | Why |
|---|---|
| Storage pipeline ran this week | `weekly_recap/{ticker}/weeks/{weekEndDate}` documents must exist — the scheduler reads these to build its Pub/Sub payloads |
| At least one user in `users/` with `isSubscribed: true`, `notificationsEnabled: true`, and a populated `watchlist/` subcollection | The scheduler only processes users meeting these criteria |
| That user has valid FCM tokens in `fcmTokens` | The processor sends real push notifications — ensure a dev device is registered |
| `REDIS_URL` in Secret Manager under `bizzie-dev-7199b` | Fetched at cold-start to connect to Redis |

---

## Why the Shell Does Not Auto-Trigger the Processor

`npm run shell` runs your compiled function code **locally** — it does not deploy to GCP. When `weeklyRecapRetrievalScheduler()` publishes messages to the `weekly-recap-delivery` Pub/Sub topic, those messages go to real GCP Pub/Sub in `bizzie-dev-7199b`. However, the shell has no push subscription watching that topic, so `weeklyRecapDeliveryProcessor` does **not** auto-fire from those messages.

You invoke the processor manually from the shell using a constructed payload (see below).

---

## Running Manually

**Step 1 — Start the shell:**
```bash
npm run shell
```

**Step 2 — Run the scheduler to populate Redis:**
```js
weeklyRecapRetrievalScheduler()
```

This reads subscribed users, populates Redis (`user:{uid}` and `ticker:{ticker}` keys with 24h TTL), then queries this week's summaries and publishes one Pub/Sub message per ticker.

**Step 3 — Invoke the processor for one ticker:**

Replace `weekEndDate`, `messageTitle`, and `messageShortSummary` with real values from a `weekly_recap/{ticker}/weeks/{weekEndDate}` document in dev Firestore (paste as a single line):

```js
weeklyRecapDeliveryProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'AAPL', companyName: 'Apple Inc.', weekEndDate: '2026-05-23', messageTitle: 'Apple Weekly Recap', messageShortSummary: 'Apple had a strong week driven by...' })).toString('base64'), attributes: {} })

weeklyRecapDeliveryProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'NFLX', companyName: 'Netflix, Inc.', weekEndDate: '2026-05-23', messageTitle: 'Netflix Weekly Recap', messageShortSummary: 'Netflix had a strong week driven by...' })).toString('base64'), attributes: {} })
```

> For `onMessagePublished` v2, the shell expects raw Pub/Sub message fields directly — it wraps them into the CloudEvent envelope itself. Do not nest inside `data.message`.

The processor claims users from Redis via `GETDEL` and sends real FCM push notifications to eligible dev devices.

**If you see `No eligible users for AAPL`:** Redis was not pre-populated (Step 2 was skipped, or the 24h TTL expired). Re-run the scheduler.

---

## Command Reference

| Command | What it does |
|---|---|
| `firebase use` | Shows the currently active Firebase project |
| `firebase use dev` | Switches to `bizzie-dev-7199b` |
| `npm run build` | Compiles TypeScript (`src/`) to JavaScript (`lib/`) |
| `npm run shell` | Builds then starts an interactive Firebase Functions shell connected to the active project |
| `npm run logs` | Streams live Cloud Function logs from the active project |

---

## What to Look for in the Logs

### Scheduler — successful run

```
[INFO]  WeeklyRecap/Retrieval/Trigger           Retrieval scheduler started
[INFO]  WeeklyRecap/Retrieval/FirestoreService  Fetched 12 users from Firestore (10 eligible)
[INFO]  WeeklyRecap/Retrieval/Usecase           Loaded 10 subscribed users with 24 unique tickers
[INFO]  WeeklyRecap/Retrieval/RedisService      Stored 10 user keys and 24 ticker sets in Redis
[INFO]  WeeklyRecap/Retrieval/FirestoreService  Retrieved 6 summaries for week 2026-05-23
[INFO]  WeeklyRecap/Retrieval/PubSubService     Published 6 messages to weekly-recap-delivery in 340ms
[INFO]  WeeklyRecap/Retrieval/Usecase           Queued 6 Pub/Sub messages in 345ms
```

`Retrieved 0 summaries` — storage pipeline has not run yet this week.

`No subscribed users found` — no users in dev Firestore meet the `isSubscribed + notificationsEnabled` criteria.

### Processor — successful delivery per ticker

```
[INFO]  WeeklyRecap/Retrieval/Trigger      Processing delivery for AAPL (Apple Inc.)
[INFO]  WeeklyRecap/Retrieval/RedisService Claimed 3/5 users for AAPL (2 already notified)
[INFO]  WeeklyRecap/Retrieval/FcmService   Sent 4/4 FCM tokens for AAPL
[INFO]  WeeklyRecap/Retrieval/Usecase      Delivery complete for AAPL: 4 tokens notified
```

`Claimed 0/N users` — all users for this ticker were already claimed by a prior invocation. No duplicate notifications sent.

`Stale FCM token for uid` at `WARN` — device token expired. Expected for inactive dev devices; token cleanup is handled separately.
