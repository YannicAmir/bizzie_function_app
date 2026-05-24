# services/ai_service.ts

Handles LLM summarization and post-processing. Owns LangSmith tracing via `LangChainTracer` and Confident AI evaluation tracing via `EvaluationService` (injected via constructor, consulted at call time).

Model lazily instantiated and cached as a private `cachedModel` field via `getModel()` — `getRemoteConfig()` is called once on the first `summarizeNews` invocation; subsequent warm calls reuse the cached `ChatVertexAI` instance. Configuration: `{ responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, endpoint: 'aiplatform.googleapis.com' }`. `responseSchema` enforces the JSON output shape at the Vertex AI level — the model is constrained to return only valid JSON matching the schema, eliminating parse errors from free-form text. Logger instantiated as `new Logger('WeeklyRecap/Storage/AiService')` from `src/core/logger.ts`. Helper functions (`isValidLLMPartial`, `isRetryableLlmError`, `stripMarkdown`) live in `helpers/llm.ts`. News text truncation (`truncateToTokens`) is applied by the `summarizeNews` LangGraph node upstream — not inside this service.

---

## Model

| Task | `AppConfig` key | Remote Config parameter | Default |
|---|---|---|---|
| `summarizeNews` | `config.weekly_recap.model` | `weekly_recap_model` | `gemini-3-flash-preview` |

Model is lazily initialized on first call via `getModel()` — `getRemoteConfig()` is called once per process lifetime and the resulting `ChatVertexAI` instance is cached. Hot-swapping a model name in Remote Config takes effect on the next cold-start.

---

## Retry Config (all LLM calls)

```typescript
retry(fn, {
  maxAttempts: 3,
  initialDelayMs: 2000,
  backoffFactor: 2,   // delay series: 2s → 4s → throw
  maxDelayMs: 30000,
})
```

---

## Functions

### `buildContextTexts(input)` / `invokeModel(model, messages, ticker, context, evaluation)`

Two module-level private functions extracted from `summarizeNews`:

- **`buildContextTexts`** — maps `news`, `filings`, and `prices` arrays into formatted text blocks (or `'(none)'`). News text is already truncated by the upstream `summarizeNews` node (`truncateToTokens(n.text, MAX_NEWS_TOKENS_PER_ITEM)` in `nodes/summarizeNews.ts`) before `AiService.summarizeNews` is called.
- **`invokeModel`** — accepts a pre-built `messages: BaseMessage[]` array (constructed upstream via `loadChatPrompt`). Contains a `runGenerate` closure that executes `model.invoke(msgs, { callbacks: [new LangChainTracer()] })`. The `LangChainTracer` callback sends every inference to LangSmith automatically. When evaluation is initialized, `updateCurrentSpan({ retrievalContext: [...], output: text })` is called **inside `runGenerate`** (while the span is still open) — calling it after `observe(...)()` returns would be too late because the span is already closed. `invokeModel` then wraps `runGenerate` with `observe({ type: SpanType.LLM, name: 'summarizeNews', model: model.modelName, metricCollection: 'weekly-recap-summary', fn: runGenerate })` when evaluation is initialized. Token counts are read from `response.usage_metadata` (`input_tokens`, `output_tokens`, `total_tokens`). JSON parsing adds an explicit try/catch that throws `Error('Invalid LLM JSON response')` on parse failure.

---

### `summarizeNews(input: SummarizeNewsInput): Promise<Partial<LLMResponse>>`

Core LLM call. Builds context text and prompt, then delegates to `invokeModel` inside a retry wrapper.

**Dual-layer tracing:**

```typescript
// AGENT span wraps the full retry loop (Confident AI / DeepEval)
return evaluation?.isInitialized
  ? observe({ type: SpanType.AGENT, name: `weeklyRecap-${ticker}`, fn: runSummarize })()
  : runSummarize();

// Inside runSummarize → invokeModel:
// LLM span wraps each individual inference attempt (Confident AI / DeepEval)
const text = await (evaluation?.isInitialized
  ? observe({ type: SpanType.LLM, name: 'summarizeNews', model: model.modelName,
               metricCollection: 'weekly-recap-summary', fn: runGenerate })(messages)
  : runGenerate(messages));

// LangSmith tracer fires on every invoke call regardless of evaluation state
const response = await model.invoke(msgs, { callbacks: [new LangChainTracer()] });
```

LangSmith traces appear in the `bizzie_dev` project under `smith.langchain.com` for every invocation. `LANGCHAIN_CALLBACKS_BACKGROUND=false` must be set in `.env` and `.env.local` to prevent the LangSmith `patchRun` from being dropped in serverless environments (see tech-stack.md).

Note: `updateCurrentSpan` for retrieval context is passed `[newsText, filingsText]` filtered to exclude `'(none)'` strings. EOD prices are not included in retrieval context (they are quantitative, not textual source documents). The full prompt is not included either (that is the `input`, not the context).

**Prompt architecture:**

The prompt is split into two exported constants in `prompts/storage_prompts.ts`:
- `SUMMARIZE_NEWS_SYSTEM_PROMPT` — the system role: financial analyst instructions and JSON output rules
- `SUMMARIZE_NEWS_USER_TEMPLATE` — the user role: all `{variable}` placeholders for market data

Inside `runSummarize`, `loadChatPrompt('summarize-news-prompt', SUMMARIZE_NEWS_SYSTEM_PROMPT, SUMMARIZE_NEWS_USER_TEMPLATE, variables)` from `src/core/prompts.ts` is called to build the `BaseMessage[]` array. If `LANGSMITH_API_KEY` is set, `loadChatPrompt` pulls the latest version of `summarize-news-prompt` from the LangSmith Prompt Hub and formats it with the provided variables — enabling prompt iteration without a redeploy. If the hub pull fails (network error, missing prompt, etc.), it falls back to the local constants automatically. The resolved messages are passed directly to `invokeModel`.

Template variables: `{ticker}`, `{companyName}`, `{startDate}`, `{endDate}`, `{startPrice}`, `{endPrice}`, `{priceChange}`, `{priceChangePercent}`, `{news}`, `{filings}`, `{prices}`.

The system prompt instructs the model to return a JSON object with the content fields only (`messageTitle`, `messageShortSummary`, `messageLongSummary`, `confidenceScore`, `newsLinks`, `eightKLinks`), and enforces:
- `messageTitle` ≤ 50 characters — must fit an Apple push notification title
- `messageShortSummary` of 2–3 sentences, ≤ 150 characters — must be fully visible in an Apple push notification body
- `messageLongSummary` concise and catchy — no hard character limit, but should be tight; written for an engaged reader, not a regulator
- `confidenceScore` as an integer between `0` and `100`
- If any source data is missing or sparse, **omit that aspect entirely** — do not fabricate or speculate.
- Price movement and news/filings are **summarized separately** within the same output. The LLM must **never imply or state that price changes were caused by any particular news item or filing**. Causation is never stated.

Count fields (`newArticleCount`, `eightKCount`, `eodStockPriceCount`), `ticker`, `companyName`, and `time` are set by the use case — the LLM does not produce them.

After parsing the model response, `isValidLLMPartial` (from `helpers/llm.ts`) is called inside the retry loop. If validation fails, a warning is logged with the raw parsed value and `Error('Invalid LLM response schema')` is thrown — triggering the retry.

---

### `postProcessLlmSummary(response: LLMResponse): LLMResponse`

Returns a new sanitized object (does not mutate). Trims whitespace from all string fields, hard-truncates `messageTitle` to 50 characters, strips stray markdown (backtick fences, extra asterisks) from summary fields.

---

