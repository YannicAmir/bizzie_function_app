# Tech Stack & Retry Strategy

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2`) |
| Scheduling | Google Cloud Scheduler |
| Message queue | Google Cloud Pub/Sub — topic: `weekly-recap` |
| Database | Google Cloud Firestore |
| LLM | Google Vertex AI — Gemini via `ChatVertexAI` from `@langchain/google-vertexai` (model from Firebase Remote Config) |
| LLM client | `@langchain/google-vertexai` — `ChatVertexAI` with `responseMimeType: 'application/json'`, `responseSchema` (enforces JSON output shape at the Vertex AI level), and `endpoint: 'aiplatform.googleapis.com'` |
| Prompt management | LangSmith Prompt Hub — `summarize-news-prompt` stored as a `ChatPromptTemplate` (system + human). Pulled at runtime via `loadChatPrompt()` in `src/core/prompts.ts`; falls back to local constants in `prompts/storage_prompts.ts` if the hub is unavailable. Enables prompt iteration without a redeploy. |
| Prompt loading utility | `src/core/prompts.ts` — `loadPrompt()` (string prompts) and `loadChatPrompt()` (chat prompt pairs). Uses `pullPromptCommit` from the LangSmith SDK and parses `manifest.kwargs` directly to extract templates, bypassing LangChain `load()` deserialization. |
| Orchestration | LangGraph — state graph per ticker invocation, typed `WeeklyRecapState` |
| Market data | Financial Modeling Prep (FMP) REST API — stable endpoint |
| LLM tracing | LangSmith — runtime tracing via `LangChainTracer` callback; traces appear in `bizzie_dev` project at `smith.langchain.com` |
| LLM evaluation | Confident AI / DeepEval — LLM-as-Judge evaluation in CI/CD; runtime observability via `traceManager.configure` from `deepeval/tracing` |
| Secrets | GCP Secret Manager — `CONFIDENT_API_KEY`, `FMP_API_KEY`, `LANGSMITH_API_KEY` |
| Retry / backoff | `src/core/retry.ts` — exponential backoff, configurable per call site |
| Logging | `src/core/logger.ts` — structured wrapper over `firebase-functions/logger` |
| Config | `src/core/remote-config.ts` — Firebase Remote Config (model names, FMP URLs) |
| Env vars | `src/core/config.ts` — `GCLOUD_PROJECT`, `LOCATION` |
| Error types | `src/core/errors.ts` — `AppError` with `code`, `status`, `retryAfterSeconds` |
| LangSmith env | `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_CALLBACKS_BACKGROUND=false` — both required in `.env` (prod) and `.env.local` (dev); without `LANGCHAIN_CALLBACKS_BACKGROUND=false`, `patchRun` is dropped in the background p-queue before `awaitAllCallbacks()` can flush it, causing traces to never appear in LangSmith |

---

## Retry Strategy

All outbound network calls are wrapped in `retry()` from `src/core/retry.ts`:

```
retry<T>(fn, { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs, shouldRetry })
```

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| Watchlist fetch (`trigger.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |
| FMP API (`fmp_service.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |
| LLM (`ai_service.ts`) | 3 | 2000ms | 2 | 2s → 4s → throw |

**Transient errors (retried):** HTTP 429, 500, 503 · `UNAVAILABLE` · `DEADLINE_EXCEEDED` · `INTERNAL` · network failures.

**Permanent errors (not retried):** HTTP 400, 401, 403, 404 — bad API key, malformed request.

**Per-ticker failure isolation:** Errors in `weeklyRecapProcessor` are caught and logged rather than re-thrown, so the Pub/Sub message is acknowledged and processing continues for other tickers. Persistent per-ticker failures route to a dead-letter topic on `weekly-recap` (configured in GCP console).

---

## Environment & Secret Management

Bizzie runs three fully isolated environments — **dev**, **qa**, and **prod** — each backed by its own Firebase project and GCP project. All infrastructure (Firestore, Pub/Sub, Cloud Functions, Secret Manager, Remote Config) is provisioned per-environment with no cross-environment data access.

**Secret pattern (mandatory for all implementations):**

| Rule | Detail |
|---|---|
| Secret names are identical across environments | `CONFIDENT_API_KEY`, `FMP_API_KEY`, `LANGSMITH_API_KEY`, etc. are the same string in dev, qa, and prod GCP Secret Manager |
| GCP project context resolves the correct value | Functions run inside their environment's GCP project — Secret Manager automatically returns that project's secret |
| No environment conditionals in code | Never branch on `process.env.ENV` to pick a secret value; the GCP project boundary handles isolation |
| Secrets fetched at cold-start | Each secret is fetched once per function instance via `@google-cloud/secret-manager` and cached for the lifetime of the instance |
| API keys are never in Remote Config or env vars | Remote Config holds non-sensitive config (URLs, model names, feature flags); Secret Manager holds all credentials |

**Accessing a secret in Firebase Functions (pattern used in this feature):**
```typescript
// trigger.ts — declare at module scope
const confidentApiKey = defineSecret('CONFIDENT_API_KEY');
const langsmithApiKey = defineSecret('LANGSMITH_API_KEY');

// bind to the function that needs the secrets
export const weeklyRecapProcessor = onMessagePublished({
  secrets: [confidentApiKey, langsmithApiKey],
  // ...
}, async (event) => {
  // secrets available as process.env inside the handler
  process.env.CONFIDENT_API_KEY  // injected by Firebase
  process.env.LANGSMITH_API_KEY  // injected by Firebase
});
```

---

## Token Budget

News text is truncated per item in the `summarizeNews` LangGraph node (`truncateToTokens(n.text, 500)` from `helpers/llm.ts`) before `AiService.summarizeNews` is called. The `truncateToTokens` helper still exists in `helpers/llm.ts` but is no longer called inside `ai_service.ts` — truncation happens exclusively in `nodes/summarizeNews.ts` upstream. 8-K data is metadata only. Stock prices are a handful of rows and need no truncation.

| Input | Limit | Where truncation happens |
|---|---|---|
| News article text | 500 tokens (~375 words) | `nodes/summarizeNews.ts` — `truncateToTokens` applied before `AiService.summarizeNews` |
| 8-K entry | No truncation | Metadata only: title, date, two URLs — ~30 tokens per entry |
| Stock price entry | No truncation | Three fields per trading day — ~15 tokens per entry |

**Estimated tokens per invocation:** ~500 (prompt) + 15,000 (30 news) + 600 (20 8-K entries) + 110 (7 price rows) + 20 (price movement) ≈ **16,230 input tokens**. Output JSON ≈ 500 tokens. At Gemini Flash pricing this is ~$0.001 per ticker.

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| LLM client | Switched from `@google-cloud/vertexai` native SDK (`getGeminiModel`) to `@langchain/google-vertexai` (`ChatVertexAI`). Enables `LangChainTracer` callback for automatic LangSmith tracing without a separate tracing layer. |
| LangSmith tracing | `LangChainTracer` is passed as a callback on every `model.invoke(...)` call. Traces appear in `smith.langchain.com` under `bizzie_dev`. `LANGSMITH_API_KEY` stored in GCP Secret Manager, injected via `defineSecret('LANGSMITH_API_KEY')`. `LANGCHAIN_TRACING_V2=true` must be set in `.env` and `.env.local`. |
| `LANGCHAIN_TRACING_V2=true` | Must be exactly the string `"true"` in `.env` (deployed) and `.env.local` (local dev) to enable LangSmith tracing via `@langchain/core`. |
| `LANGCHAIN_CALLBACKS_BACKGROUND=false` | Required in `.env` (deployed) and `.env.local` (local dev) to prevent LangSmith's `patchRun` from being dropped in the serverless p-queue. Without this, traces are created but never updated with outputs. |
| DeepEval tracing placement | `observe` spans are placed in `AiService`: AGENT-level wraps `runSummarize` (full retry loop), LLM-level wraps each `runGenerate` call. No separate `evaluateSummary` node. Confident AI receives traces automatically. |
| LLM evaluation metrics | Configured in the Confident AI dashboard per project, not in code. DeepEval SDK sends trace data; metric definition, scoring, and LLM-as-Judge are managed on the Confident AI platform. See [evaluation.md](evaluation.md). |
| Remote Config model key | `weekly_recap_model` (dedicated key, already added to dev/qa/prod Remote Config). Default: `gemini-3-flash-preview`. |
| Dead-letter topic setup | Required before going to production. See [dead-letter-setup.md](dead-letter-setup.md) for step-by-step instructions. |
