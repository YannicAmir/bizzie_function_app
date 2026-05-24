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

**Step 6 — Verify LangSmith traces:**

Open [smith.langchain.com](https://smith.langchain.com) → project `bizzie_dev`. Traces named `LangGraph` should appear for each ticker within a few seconds of the invocation completing.

**Step 7 — Verify Confident AI traces:**

Open [app.confident-ai.com](https://app.confident-ai.com) → project `bizzie-dev` → Tracing. `weeklyRecap-{ticker}` AGENT spans containing `summarizeNews` LLM spans should appear.

---

## Option B — Shell Only (No Deploy)

Use this when you want to test the graph logic locally for a single ticker without deploying. The processor is never triggered via Pub/Sub — you invoke it directly with a manually constructed message.

**Step 1 — Confirm env vars are set in `.env.local`:**

Ensure the following are present:
```
LANGCHAIN_CALLBACKS_BACKGROUND=false
LANGSMITH_API_KEY=<your key for bizzie_dev workspace>
LANGSMITH_PROJECT=bizzie_dev
CONFIDENT_API_KEY=<your Confident AI key>
```

`LANGCHAIN_CALLBACKS_BACKGROUND=false` is required — without it, the LangSmith `patchRun` is dropped in the background p-queue before `awaitAllCallbacks()` flushes, and traces never appear.

Add `LANGSMITH_DEBUG=true` to see HTTP request/response logs (`→ POST .../runs/multipart`, `← 202 Accepted`) confirming traces are being sent.

> **Testing hub prompt pulling locally:** Because `LANGSMITH_API_KEY` is present in `.env.local`, the shell will automatically attempt to pull prompts from LangSmith hub before falling back to the local templates. This means once you have synced prompts to LangSmith (see [Adding Prompts to LangSmith](#adding-prompts-to-langsmith) below), the shell will use the hub version — the same prompt the deployed function uses. To force local templates regardless, temporarily remove or comment out `LANGSMITH_API_KEY` from `.env.local` before starting the shell.

**Step 2 — Start the shell:**
```bash
npm run shell
```

**Step 3 — Invoke the processor for one ticker** (paste as a single line):
```js
weeklyRecapProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'NVDA', companyName: 'NVIDIA Corporation' })).toString('base64'), attributes: {} })

weeklyRecapProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'FTNT', companyName: 'Fortinet, Inc' })).toString('base64'), attributes: {} })

weeklyRecapProcessor({ data: Buffer.from(JSON.stringify({ ticker: 'INTU', companyName: 'Intuit Inc' })).toString('base64'), attributes: {} })
```

> Note: for `onMessagePublished` v2, the shell expects the raw Pub/Sub message fields directly — it wraps them into the CloudEvent envelope itself. Do not nest inside `data.message`.
**What this does:** calls the processor function locally, bypassing Pub/Sub entirely. The function deserializes the base64-encoded JSON payload, seeds the LangGraph state with `{ ticker, companyName }`, and runs the full graph — FMP fetches, LLM summarization, schema validation, assembly, post-processing, and a Firestore write to dev. All I/O hits `bizzie-dev-7199b`.

Pick any ticker from the dev watchlist (e.g. `AAPL`, `MSFT`, `GOOG`). The processor only needs `ticker` and `companyName` as seed inputs.

**Step 4 — Verify the result in Firestore:**

Same as Option A — check `weekly_recap/{ticker}/weeks/{weekEndDate}` in `bizzie-dev-7199b`.

**Step 5 — Verify LangSmith trace:**

Open [smith.langchain.com](https://smith.langchain.com) → project `bizzie_dev`. A new trace named `LangGraph` should appear within a few seconds of the invocation completing. The trace shows the LLM call duration, token counts, inputs, and outputs.

**Step 6 — Verify Confident AI trace:**

Open [app.confident-ai.com](https://app.confident-ai.com) and navigate to the `bizzie-dev` project → Tracing. A new `weeklyRecap-{ticker}` AGENT span containing a `summarizeNews` LLM span should appear. This confirms DeepEval observation is wired correctly.

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

---

## Adding Prompts to LangSmith

LangSmith Prompt Hub is a version-controlled store for your LLM prompts. Once a prompt is synced there, the deployed function pulls the latest version at runtime — you can edit a prompt and see the change live without redeploying. This section walks through syncing from scratch.

### What "syncing" means

The prompts live as TypeScript string constants in `src/features/weekly_recap/storage/prompts/storage_prompts.ts`. Syncing reads those constants and pushes them to LangSmith hub under a derived name:

| Constant | Hub name |
|---|---|
| `SUMMARIZE_NEWS_SYSTEM_PROMPT` | `summarize-news-system-prompt` |
| `SUMMARIZE_NEWS_USER_TEMPLATE` | `summarize-news-user-template` |

After syncing, every deployed environment that has `LANGSMITH_API_KEY` set will pull from the hub instead of using the local file. The local file always remains the fallback — it is never deleted.

