# services/ai_service.ts

Handles LLM summarization and post-processing. Owns the `traceCallback` integration with Confident AI — `EvaluationService` is injected via constructor and consulted at call time.

Model instances obtained via `getGeminiModel(modelName)` from `src/core/vertex-ai.ts`. Model name resolved at call time via `getRemoteConfig()` from `src/core/remote-config.ts` — accessed as `config.weekly_recap.model`. All calls use `responseMimeType: 'application/json'` for structured output. Logger instantiated as `new Logger('WeeklyRecap/Storage/AiService')` from `src/core/logger.ts`. Helper functions (`isValidLLMPartial`, `isRetryableLlmError`, `truncateToTokens`, `stripMarkdown`) live in `helpers/llm.ts`.

---

## Model

| Task | `AppConfig` key | Remote Config parameter | Default |
|---|---|---|---|
| `summarizeNews` | `config.weekly_recap.model` | `weekly_recap_model` | `gemini-3-flash-preview` |

`getRemoteConfig()` is called at invocation time — model is hot-swappable without a redeploy.

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

### `summarizeNews(input: SummarizeNewsInput): Promise<Partial<LLMResponse>>`

Core LLM call. Interpolates inputs into a prompt template and calls the model.

**Confident AI tracing:** Inside the `retry` closure, if `evaluation.isInitialized`, the `model.generateContent(...)` call is wrapped with `traceCallback` from `@confident-ai/deepeval`:

```typescript
const response = await (evaluation?.isInitialized
  ? traceCallback(runGenerate, {
      model: modelName,
      traceAttributes: { ticker, feature: FEATURE_NAME },
    })
  : runGenerate());
```

`traceCallback` wraps the individual `generateContent` call (not the retry wrapper), so each inference attempt is traced independently. If `EvaluationService` is not initialized, `runGenerate()` is called directly with no overhead.

Token counts (`inputTokenCount`, `outputTokenCount`) are intentionally omitted from `traceCallback` options — the API requires them before the function runs, making actual values from `usageMetadata` unavailable at that point. Exact token counts are logged separately from `response.response.usageMetadata` after the call completes.

**Prompt architecture — LangSmith-ready from day one:**

The prompt is defined as a single exported constant `SUMMARIZE_NEWS_PROMPT` using LangSmith `{variable}` placeholder syntax. During development it is interpolated locally; when moving to production it is uploaded to LangSmith Prompts as-is and pulled at runtime via `client.pullPrompt('weekly-recap-summarize')` — no rewriting required.

```
// dev: interpolate locally
const prompt = SUMMARIZE_NEWS_PROMPT
  .replace('{ticker}', ticker)
  .replace('{companyName}', companyName)
  ...

// prod (LangSmith): pull and invoke
const promptTemplate = await client.pullPrompt('weekly-recap-summarize');
```

Variables in the template: `{ticker}`, `{companyName}`, `{startDate}`, `{endDate}`, `{startPrice}`, `{endPrice}`, `{priceChange}`, `{priceChangePercent}`, `{news}`, `{pressReleases}`, `{filings}`, `{prices}`.

The prompt instructs the model to return a JSON object with the content fields only (`messageTitle`, `messageShortSummary`, `messageLongSummary`, `confidenceScore`, `newsLinks`, `pressReleaseLinks`, `eightKLinks`), and enforces:
- `messageTitle` ≤ 50 characters — must fit an Apple push notification title
- `messageShortSummary` of 2–3 sentences, ≤ 150 characters — must be fully visible in an Apple push notification body
- `messageLongSummary` concise and catchy — no hard character limit, but should be tight; written for an engaged reader, not a regulator
- `confidenceScore` as an integer between `0` and `100`
- If any source data is missing or sparse, **omit that aspect entirely** — do not fabricate or speculate.
- Price movement and news/filings are **summarized separately** within the same output. The LLM must **never imply or state that price changes were caused by any particular news item, press release, or filing**. Causation is never stated.

Count fields (`newArticleCount`, `pressReleaseCount`, `eightKCount`, `eodStockPriceCount`), `ticker`, `companyName`, and `time` are set by the use case — the LLM does not produce them.

After parsing the model response, `isValidLLMPartial` (from `helpers/llm.ts`) is called inside the retry loop. If validation fails, a warning is logged with the raw parsed value and `Error('Invalid LLM response schema')` is thrown — triggering the retry.

---

### `postProcessLlmSummary(response: LLMResponse): LLMResponse`

Returns a new sanitized object (does not mutate). Trims whitespace from all string fields, hard-truncates `messageTitle` to 50 characters, strips stray markdown (backtick fences, extra asterisks) from summary fields.

---

