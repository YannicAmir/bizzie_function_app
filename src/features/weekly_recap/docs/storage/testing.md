# Testing

Unit tests for all non-LLM logic using **Jest**. LLM output quality is handled separately by DeepEval in the CI/CD pipeline — see [evaluation.md](evaluation.md).

---

## Commands

| Command | What it runs |
|---|---|
| `npm test` | All Jest unit tests |
| `npm test -- --coverage` | With coverage report |
| `npm test -- --watch` | Watch mode during development |

---

## Test File Locations

Tests mirror the source tree:

```
src/features/weekly_recap/storage/
├── services/
│   └── __tests__/
│       ├── fmp_service.test.ts
│       ├── ai_service.test.ts
│       └── firestore_service.test.ts
└── nodes/
    └── __tests__/
        ├── calculateWeekWindow.test.ts
        ├── calculateDeterministicFields.test.ts
        ├── validateSchema.test.ts
        ├── assembleResponse.test.ts
        └── postProcessResponse.test.ts
```

---

## What to Test

### `fmp_service.ts`

| Case | What to verify |
|---|---|
| HTTP request construction | Correct URL, query params, and API key on every method |
| Response mapping | Raw FMP fields map correctly to `NewsArticle`, `PressRelease`, `Filing8K`, `StockPrice` |
| 8-K client-side filter | Only records with `formType === '8-K'` are returned from `get8Ks` |
| Retry on transient error | Mock HTTP 429 / 503 → verify `retry()` attempts again |
| No retry on permanent error | Mock HTTP 404 → verify immediate throw, no retry |
| Empty response | FMP returns `[]` → method returns `[]`, does not throw |

### `ai_service.ts`

| Case | What to verify |
|---|---|
| `postProcessLlmSummary` — truncation | `messageTitle` > 50 chars is hard-truncated to exactly 50 |
| `postProcessLlmSummary` — immutability | Input object is not mutated; a new object is returned |
| `postProcessLlmSummary` — whitespace | Leading/trailing whitespace stripped from all string fields |
| `postProcessLlmSummary` — markdown | Backtick fences and stray asterisks removed from summary fields |
| Prompt interpolation | All `{variable}` placeholders replaced; no placeholders remain in the final string |

LLM output quality is not tested here — that is DeepEval's responsibility.

### `firestore_service.ts`

| Case | What to verify |
|---|---|
| `retrieveCompaniesFromDb` — happy path | Firestore documents mapped to `Company[]` correctly |
| `retrieveCompaniesFromDb` — empty collection | Returns `[]`, does not throw |
| `storeSummaryInDb` — path | Writes to `weekly_recap/{ticker}/weeks/{weekEndDate}` |
| `storeSummaryInDb` — document ID | Derived from date portion of `response.time` (e.g. `"2026-05-15T16:00:00.000Z"` → `"2026-05-15"`) |
| `storeSummaryInDb` — timestamp | `createdAt: FieldValue.serverTimestamp()` merged into the payload |

### LangGraph Nodes (pure nodes only)

| Node | What to test |
|---|---|
| `calculateWeekWindow` | `endDate` is today (ISO); `startDate` is exactly 7 days prior |
| `calculateDeterministicFields` | Counts match array lengths; `priceChange` and `priceChangePercent` math; `null` fields when `prices` is empty |
| `validateSchema` | Passes valid `LLMResponse`; throws `AppError` for each missing required field; throws on `confidenceScore` outside `[0, 100]` |
| `assembleResponse` | Merges `llmPartial` + deterministic fields; deterministic fields are never overwritten by LLM fields |
| `postProcessResponse` | Delegates to `AiService.postProcessLlmSummary`; returns a new object |

---

## What NOT to Test

| Area | Reason |
|---|---|
| LLM output quality | Handled by DeepEval in CI/CD — see [evaluation.md](evaluation.md) |
| FMP API response schema | External contract; mocked at the HTTP boundary |
| Firestore document structure on disk | Integration concern; not a unit test responsibility |
| LangGraph graph wiring / compilation | Framework concern; nodes are tested in isolation |
| Logger output | Never assert on log messages in unit tests |

---

## Mocking Strategy

| Dependency | How to mock |
|---|---|
| FMP HTTP calls | Mock `axios` or `fetch` at the module boundary — never call real FMP in tests |
| Vertex AI / Gemini | Mock `getGeminiModel()` from `src/core/vertex-ai.ts` — return a canned JSON response |
| Firestore | Mock `getFirebaseAdmin().firestore()` — verify calls and arguments |
| Remote Config | Mock `getRemoteConfig()` to return a fixed `AppConfig` |
| Logger | Suppress or spy; never assert on log output |
