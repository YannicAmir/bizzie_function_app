# Evaluation

LLM output quality is evaluated via **Confident AI / DeepEval**. Metrics are configured in the Confident AI platform dashboard and scored automatically whenever DeepEval runtime spans are sent from the application. Runtime LLM call tracing (latency, tokens, I/O) is handled separately by **LangSmith** via a `LangChainTracer` callback.

---

## Observability Overview

| Concern | Tool | Where |
|---|---|---|
| Per-ticker processing | — | Runtime — `weeklyRecapProcessor` writes summaries to Firestore |
| LLM call tracing (latency, tokens, I/O) | **LangSmith** | Runtime — `LangChainTracer` callback on every `model.invoke()` |
| LLM quality evaluation (faithfulness, relevancy, summarization) | **Confident AI / DeepEval** | Runtime — `observe` spans sent from `AiService`; metrics scored on Confident AI platform |
| Schema correctness | — | Runtime — `validateSchema` LangGraph node (pure TypeScript) |
| Service correctness | — | CI/CD — Jest unit tests (see [testing.md](testing.md)) |

---

## LangSmith Runtime Tracing

Every `model.invoke()` call in `AiService.invokeModel` passes `new LangChainTracer()` as an explicit callback:

```typescript
const response = await model.invoke([new HumanMessage(p)], {
  callbacks: [new LangChainTracer()],
});
```

`ChatVertexAI` goes through `@langchain/core`'s callback system, so passing `LangChainTracer` ensures every inference creates a run in LangSmith. This traces: input prompt, output text, token counts, model name, and latency. Graph-level LangGraph nodes are plain functions and do not appear as separate LangSmith traces.

**Required env vars:**

| Variable | Value | Where |
|---|---|---|
| `LANGCHAIN_TRACING_V2` | `true` (must be exactly the string `"true"`) | `.env` (deployed) and `.env.local` (local) |
| `LANGSMITH_API_KEY` | Key for `bizzie_dev` workspace | GCP Secret Manager (`defineSecret`) in prod; `.env.local` locally |
| `LANGSMITH_PROJECT` | `bizzie_dev` | `.env` (deployed) and `.env.local` (local) |
| `LANGCHAIN_CALLBACKS_BACKGROUND` | `false` | `.env` (deployed) and `.env.local` (local) |
| `LANGSMITH_ENDPOINT` | `https://api.smith.langchain.com` | Optional — defaults to this value if not set |

**Why `LANGCHAIN_CALLBACKS_BACKGROUND=false` is critical:** By default, LangChain callbacks are dispatched into a background p-queue. In serverless environments (Firebase Functions), the function instance exits before the background queue drains. `awaitAllCallbacks()` calls `awaitPendingTraceBatches()` in parallel with `queue.onIdle()` — but `patchRun` (which carries `end_time` and `outputs`) hasn't been queued yet when the snapshot is taken. Setting `LANGCHAIN_CALLBACKS_BACKGROUND=false` makes all callbacks synchronous, so both `createRun` and `patchRun` are queued before the snapshot. Both `.env` and `.env.local` must have this set.

**Why the previous approach did not work:** The prior implementation used `@google-cloud/vertexai` directly (`model.generateContent()`), which bypasses LangChain's callback system entirely. LangSmith never saw those calls.

---

## Confident AI / DeepEval Runtime Spans

`AiService` uses `observe` from `deepeval/tracing` at two levels when `EvaluationService.isInitialized` is true:

- **AGENT span** (`weeklyRecap-{ticker}`): wraps the full `runSummarize` function including retries — names the trace in Confident AI
- **LLM span** (`summarizeNews`): wraps each individual `runGenerate` call; `retrievalContext` and `output` set via `updateCurrentSpan` **inside `runGenerate`** (while the span is still open)

`EvaluationService.init()` is called at the start of each `weeklyRecapProcessor` invocation. It calls `traceManager.configure({ confidentApiKey, tracingEnabled: true })` from `deepeval/tracing`.

**Retrieval context:** `updateCurrentSpan` receives `[newsText, filingsText]` filtered to exclude `'(none)'` strings. EOD prices are not included (quantitative, not textual source documents). The full prompt is not included (that is the LLM `input`, not the retrieval context).

**Why `updateCurrentSpan` must be called inside `runGenerate`:** The `observe` span closes when `runGenerate` returns. Calling `updateCurrentSpan` after `observe(...)()` returns means the span is already closed and the update has no effect.

---

## Metric Collection — Platform Setup

Metrics are configured in the **Confident AI dashboard** (`app.confident-ai.com`), not in code. The metric collection name is `weekly-recap-summary` — this must match the `metricCollection` value in the LLM span.

### Creating the metric collection

1. Log in to `app.confident-ai.com` and select the project for the target environment (dev / qa / prod).
2. Navigate to **Metric Collections** and click **Create**.
3. Name: `weekly-recap-summary`. Save.

### Adding the three metrics

In the `weekly-recap-summary` metric collection, add the following three metrics:

| Metric | Threshold | Required fields |
|---|---|---|
| **Faithfulness** | 0.8 | Input + Actual Output + Retrieval Context |
| **Answer Relevancy** | 0.8 | Input + Actual Output |
| **Summarization** | 0.58 | Input + Actual Output |

For each metric, the LLM-as-Judge model and detailed settings are configured on the platform — no code changes are needed to adjust thresholds.

---

## Authentication & Multi-Environment Pattern

| Rule | Detail |
|---|---|
| Identical secret name across environments | `CONFIDENT_API_KEY` is the same string in dev, qa, and prod GCP Secret Manager and CI secrets |
| One Confident AI project per environment | Dev, qa, and prod datasets and results are isolated by project |
| No env conditionals in code | The GCP project boundary and the injected `CONFIDENT_API_KEY` resolve the correct project |
