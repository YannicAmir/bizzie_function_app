# usecase.ts

Orchestrates the per-ticker processing pipeline using a **LangGraph** state graph. Exports `buildGraph(fmp, ai, db)` — called once at cold-start by `trigger.ts`, which owns all service instantiation. `EvaluationService` is injected directly into `AiService` at construction time, so it does not appear as a `buildGraph` parameter. Model types are sourced directly from `models/` by each consumer.

---

## Graph State

Typed state object that flows through every node. Each node reads what it needs and writes its outputs back into state.

```typescript
interface WeeklyRecapState {
  // Input (seeded by trigger.ts)
  ticker: string;
  companyName: string;

  // Derived by calculateWeekWindow node
  startDate: string;
  endDate: string;

  // Fetched by fetchMarketData node
  news: NewsArticle[];
  filings: Filing8K[];
  prices: StockPrice[];

  // Derived deterministically
  counts: Pick<LLMResponse, 'newArticleCount' | 'eightKCount' | 'eodStockPriceCount'>;
  priceMovement: PriceMovement;

  // LLM output (content fields only)
  llmPartial: Partial<LLMResponse>;

  // Final assembled + post-processed response
  llmResponse: LLMResponse;
}
```

---

## Nodes

| Node | Calls | Writes to state |
|---|---|---|
| `calculateWeekWindow` | pure function | `startDate`, `endDate` |
| `fetchMarketData` | `FmpService.*` (parallel) | `news`, `filings`, `prices` |
| `calculateDeterministicFields` | pure functions | `counts`, `priceMovement` |
| `summarizeNews` | `AiService.summarizeNews` (internally wraps `generateContent` with `traceCallback` via injected `EvaluationService`) | `llmPartial` |
| `validateSchema` | pure TypeScript check | — (logs invalid fields, returns `{}`; `routeAfterValidation` routes to END or continue) |
| `assembleResponse` | pure function | `llmResponse` |
| `postProcessResponse` | `AiService.postProcessLlmSummary` | `llmResponse` |
| `storeSummary` | `FirestoreService.storeSummaryInDb` | — |

---

## Graph Edges

```
START
  └─▶ calculateWeekWindow
        └─▶ fetchMarketData          (Promise.allSettled within node)
              └─▶ calculateDeterministicFields
                    └─▶ summarizeNews           (EvaluationService.wrapCall wraps live LLM call)
                          └─▶ validateSchema
                                ├─▶ (valid)   assembleResponse
                                │               └─▶ postProcessResponse
                                │                     └─▶ storeSummary ──▶ END
                                └─▶ (invalid) END  (AppError logged, message acknowledged)
```

---

## Node Detail

### `calculateWeekWindow`
Derives `endDate` (current datetime as ISO string) and `startDate` (7 days prior). Centralised here so all downstream nodes use a consistent window.

### `fetchMarketData`
Calls `FmpService.getNews`, `get8Ks`, and `getEodStockPrice` concurrently via `Promise.allSettled`. Each call is independent — a failure after all retries logs a warning and defaults to an empty array, allowing the graph to continue with partial data. The LLM is instructed to omit any aspect where data is missing. `Promise.all` is explicitly avoided here: it would abort all successful fetches the moment any single call fails. Text fields are truncated to token budget before being written to state (see [tech-stack.md](tech-stack.md)).

### `calculateDeterministicFields`
Derives `counts` from array lengths and `priceMovement` (`startPrice`, `endPrice`, `priceChange`, `priceChangePercent`) from the `prices` array. Returns `null` fields if `prices` is empty. No LLM involved.

### `summarizeNews`
Calls `AiService.summarizeNews`. Tracing is handled inside `AiService` — `traceCallback` wraps the `model.generateContent` call directly, with `model`, estimated token counts, and trace attributes. Returns LLM content fields only — deterministic fields are not produced by the LLM.

### `validateSchema`
Pure TypeScript check — no LLM. Confirms all required fields exist with correct types and `confidenceScore` is an integer in `[0, 100]`. On failure: logs each invalid field individually and returns `{}` — does NOT throw. `routeAfterValidation` detects the invalid `llmPartial` via `isValidLLMPartial` and routes to END, acknowledging the message without a Pub/Sub retry. Throwing would bypass conditional routing and cause unwanted retries — the LLM has already been retried 3× internally.

### `assembleResponse`
Merges `llmPartial` with deterministic fields (`ticker`, `companyName`, `time`, `counts`, `priceMovement`) to produce the final `LLMResponse`.

### `postProcessResponse`
Sanitises the assembled response: trims whitespace, hard-truncates `messageTitle` to 50 chars, strips stray markdown.

### `storeSummary`
Writes `llmResponse` to `weekly_recap/{ticker}/weeks/{weekEndDate}` via `FirestoreService`. The write is wrapped in `retry` (3 attempts, 1s initial delay, ×2 backoff) so transient Firestore failures resolve locally without re-running the full pipeline. On final exhaustion the error is logged and re-thrown, causing Pub/Sub to retry. Transitions to END.
