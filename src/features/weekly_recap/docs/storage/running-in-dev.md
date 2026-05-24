# Running the Weekly Recap Storage Pipeline in Dev

How to manually trigger the pipeline against real dev infrastructure to verify it works end-to-end before deploying to QA or prod.

---

## Before You Start — Confirm You Are on Dev

```bash
firebase use
```

**What this does:** prints the currently active Firebase project. The Firebase CLI uses this project for all Firestore, Pub/Sub, and function operations.

**Expected output:**
```
bizzie-dev-7199b
```

If it shows `bizzie-qa-e2f9c` or `bizzie-prod`, switch to dev first:

```bash
firebase use dev
```

Projects are defined in `.firebaserc` at the repo root. Never run the scheduler or processor shell commands against `prod`.

---

## Why the Shell Does Not Auto-Trigger the Processor

`npm run shell` runs your compiled function code **locally on your machine** — it does not deploy anything to GCP. When `weeklyRecapScheduler()` publishes messages to the `weekly-recap` Pub/Sub topic, those messages are sent to the real GCP Pub/Sub in `bizzie-dev-7199b`. However, the shell has no listener watching that topic, so `weeklyRecapProcessor` does **not** auto-trigger.

For the processor to trigger automatically from a Pub/Sub message, the function must be **deployed** — GCP then has a push subscription that calls the deployed function when messages arrive.

There are two approaches depending on whether you want to deploy first.

---

## Option A — Full End-to-End (Recommended)

Deploy the functions to dev, then trigger the scheduler from the shell. The processor triggers automatically for every ticker on the watchlist.

**Step 1 — Deploy to dev:**
```bash
firebase deploy --only functions --project dev
```
**What this does:** compiles TypeScript and uploads `weeklyRecapScheduler` and `weeklyRecapProcessor` to `bizzie-dev-7199b`. GCP creates a push subscription from the `weekly-recap` Pub/Sub topic to the deployed processor.

**Step 2 — Start the shell:**
```bash
npm run shell
```
**What this does:** runs `npm run build` (compiles TypeScript to `lib/`) then starts an interactive Firebase Functions shell connected to `bizzie-dev-7199b`. All Firestore reads and Pub/Sub publishes in this shell hit real dev infrastructure.

**Step 3 — Invoke the scheduler:**
```js
weeklyRecapScheduler()
```
**What this does:** calls your scheduler function locally. It reads every ticker from the `watchlist` collection in dev Firestore and publishes one Pub/Sub message per ticker to the `weekly-recap` topic in `bizzie-dev-7199b`. Because the processor is now deployed, GCP delivers each message to the deployed `weeklyRecapProcessor` — one Cloud Function invocation per ticker.

**Step 4 — Watch the logs:**
```bash
npm run logs
```
**What this does:** streams live Cloud Function logs from `bizzie-dev-7199b` to your terminal. You will see each node's log lines in sequence: FMP fetches, LLM token usage, schema validation, and the Firestore write confirmation.

**Step 5 — Verify the result in Firestore:**

Open the Firebase console for `bizzie-dev-7199b` and navigate to:
```
weekly_recap/{ticker}/weeks/{weekEndDate}
```

Each processed ticker should have a document containing `messageTitle`, `messageShortSummary`, `messageLongSummary`, `confidenceScore`, link arrays, count fields, `priceMovement`, and `time`.

---

## Option B — Shell Only (No Deploy)

Use this when you want to test the graph logic locally for a single ticker without deploying. The processor is never triggered via Pub/Sub — you invoke it directly with a manually constructed message.

**Step 1 — Start the shell:**
```bash
npm run shell
```

**Step 2 — Invoke the processor for one ticker** (paste as a single line):
```js
weeklyRecapProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'AAPL', companyName: 'Apple Inc.' })).toString('base64'), attributes: {} })
```

> Note: for `onMessagePublished` v2, the shell expects the raw Pub/Sub message fields directly — it wraps them into the CloudEvent envelope itself. Do not nest inside `data.message`.
**What this does:** calls the processor function locally, bypassing Pub/Sub entirely. The function deserializes the base64-encoded JSON payload, seeds the LangGraph state with `{ ticker, companyName }`, and runs the full graph — FMP fetches, LLM summarization, schema validation, assembly, post-processing, and a Firestore write to dev. All I/O hits `bizzie-dev-7199b`.

Pick any ticker from the dev watchlist (e.g. `AAPL`, `MSFT`, `GOOG`). The processor only needs `ticker` and `companyName` as seed inputs.

**Step 3 — Verify the result in Firestore:**

Same as Option A — check `weekly_recap/{ticker}/weeks/{weekEndDate}` in `bizzie-dev-7199b`.

---

## Command Reference

| Command | What it does |
|---|---|
| `firebase use` | Shows the currently active Firebase project (dev / qa / prod) |
| `firebase use dev` | Switches the active project to `bizzie-dev-7199b` |
| `npm run build` | Compiles TypeScript source (`src/`) to JavaScript (`lib/`) |
| `npm run shell` | Builds then starts an interactive Firebase Functions shell connected to the active project |
| `firebase deploy --only functions --project dev` | Deploys all Cloud Functions to `bizzie-dev-7199b` |
| `npm run logs` | Streams live Cloud Function logs from the active project to your terminal |

---

## What to Look for in the Logs

A successful run produces this sequence per ticker:

```
[INFO]  Processing AAPL (Apple Inc.)
[INFO]  Fetching news for AAPL
[INFO]  Fetched 5 news for AAPL
...
[DEBUG] Sending prompt to LLM
[INFO]  Token usage { promptTokenCount: ..., candidatesTokenCount: ..., totalTokenCount: ... }
[INFO]  LLM summary generated for AAPL in 4321ms
[INFO]  Schema valid for AAPL
[INFO]  Stored summary for AAPL / 2026-05-23
[INFO]  Completed AAPL (Apple Inc.)
```

If schema validation fails, you will see per-field `[ERROR]` lines instead of `"Schema valid"`. The graph routes to END and the message is acknowledged without retry.

If the Firestore write fails transiently, the retry utility logs `[WARN]` for each attempt before the node logs `[ERROR]` on final exhaustion and re-throws to Pub/Sub.
