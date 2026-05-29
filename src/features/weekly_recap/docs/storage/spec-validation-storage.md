# Spec Validation — Weekly Recap Storage Pipeline

**Spec docs reviewed:**
- `src/features/weekly_recap/docs/storage/overview.md`
- `src/features/weekly_recap/docs/storage/trigger.md`
- `src/features/weekly_recap/docs/storage/usecase.md`
- `src/features/weekly_recap/docs/storage/data-models.md`
- `src/features/weekly_recap/docs/storage/langgraph.md`
- `src/features/weekly_recap/docs/storage/ai-service.md`
- `src/features/weekly_recap/docs/storage/firestore-service.md`
- `src/features/weekly_recap/docs/storage/fmp-service.md`
- `src/features/weekly_recap/docs/storage/pubsub-service.md`
- `src/features/weekly_recap/docs/storage/logging.md`
- `src/features/weekly_recap/docs/storage/tech-stack.md`
- `src/features/weekly_recap/docs/storage/evaluation.md`
- `src/features/weekly_recap/docs/storage/testing.md`
- `src/features/weekly_recap/docs/storage/dead-letter-setup.md`

**Implementation reviewed:**
- `src/features/weekly_recap/storage/trigger.ts`
- `src/features/weekly_recap/storage/usecase.ts`
- `src/features/weekly_recap/storage/models/NewsArticle.ts`
- `src/features/weekly_recap/storage/models/Filing8K.ts`
- `src/features/weekly_recap/storage/models/StockPrice.ts`
- `src/features/weekly_recap/storage/models/PriceMovement.ts`
- `src/features/weekly_recap/storage/models/LLMResponse.ts`
- `src/features/weekly_recap/storage/models/index.ts`
- `src/features/weekly_recap/storage/nodes/calculateWeekWindow.ts`
- `src/features/weekly_recap/storage/nodes/fetchMarketData.ts`
- `src/features/weekly_recap/storage/nodes/calculateDeterministicFields.ts`
- `src/features/weekly_recap/storage/nodes/summarizeNews.ts`
- `src/features/weekly_recap/storage/nodes/validateSchema.ts`
- `src/features/weekly_recap/storage/nodes/assembleResponse.ts`
- `src/features/weekly_recap/storage/nodes/postProcessResponse.ts`
- `src/features/weekly_recap/storage/nodes/storeSummary.ts`
- `src/features/weekly_recap/storage/services/ai_service.ts`
- `src/features/weekly_recap/storage/services/firestore_service.ts`
- `src/features/weekly_recap/storage/services/fmp_service.ts`
- `src/features/weekly_recap/storage/services/pubsub_service.ts`

**Date:** 2026-05-22

---

## Summary

87 claims checked — 71 conform, 4 partial, 4 diverge, 8 undocumented.

---

## Divergences

### D1: Trigger logs "Companies loaded" only when list is non-empty — spec requires it unconditionally

**Spec says** (`logging.md`): The scheduler log sequence is: (1) `info "Scheduler started"`, (2) `info "Loaded {n} companies from watchlist"`, (3) `warn "Watchlist is empty — nothing to process"` (when empty). The "Companies loaded" log is listed as a distinct unconditional event before the empty-check branch.

**Code does:** `trigger.ts:28–33` — the empty-list guard executes first (`if (companies.length === 0) { logger.warn(...); return; }`). The `logger.info(\`Loaded ${companies.length} companies from watchlist\`)` on line 33 is only reached when the list is non-empty. When the watchlist is empty, the "Loaded" log is never emitted.

**Impact:** When the watchlist is empty, Cloud Logging contains only the "Scheduler started" and "Watchlist is empty" events — the "Loaded 0 companies" confirmation is absent. Operators cannot distinguish a successful empty-collection read from a failure that never reached the empty check.

---

### D2: Scheduler has no per-company error isolation — a single publish failure aborts the entire batch

**Spec says** (`logging.md`): `Queue failure (per company) | error | "Failed to queue {ticker} ({companyName}) — skipping"`. The existence of this event implies individual company publish failures are caught and skipped, not propagated.

**Code does:** `trigger.ts:36` — `await pubSubService.queueCompanies(companies)` is called as a single atomic await with no per-company try/catch. `pubsub_service.ts:16–19` iterates serially inside `queueCompanies`; a failed `topic.publishMessage` throws and propagates out of `queueCompanies`, aborting all remaining tickers. Neither file contains the per-ticker skip log or the prescribed error message.

**Impact:** A single Pub/Sub publish failure stops the entire scheduler run. The error log `"Failed to queue {ticker} ({companyName}) — skipping"` is never emitted. All tickers after the failure point are silently not queued.

---

### D3: `fmp_service.ts` — `isTransientError` does not check for `INTERNAL` gRPC status

**Spec says** (`tech-stack.md`): "Transient errors (retried): HTTP 429, 500, 503 · `UNAVAILABLE` · `DEADLINE_EXCEEDED` · `INTERNAL` · network failures."

**Code does:** `fmp_service.ts:9–19` — checks `status === 429 || 500 || 503`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, `timeout`, `network`. The string `INTERNAL` is absent. (Note: `ai_service.ts:54–65` does correctly check `INTERNAL` for Vertex errors.)

**Impact:** FMP calls that fail with a gRPC `INTERNAL` status will not be retried and will propagate immediately as permanent errors. The FMP API may return `INTERNAL` on transient infrastructure issues. This is a silent correctness gap.

---

### D4: `postProcessLlmSummary` — `messageShortSummary` is not passed through `stripMarkdown`

**Spec says** (`ai-service.md`): "strips stray markdown (backtick fences, extra asterisks) from summary fields." Both `messageShortSummary` and `messageLongSummary` are summary fields.

**Code does:** `ai_service.ts:208–209` — `messageShortSummary` receives only `trimStr`; `messageLongSummary` receives `stripMarkdown(trimStr(...))`. `messageShortSummary` is not passed through `stripMarkdown`.

**Impact:** If the LLM wraps `messageShortSummary` in backtick fences or stray asterisks, those artefacts will survive post-processing and appear in the Pub/Sub push notification body visible to end users.

---

## Partial Matches

### P1: `validateSchema` — routing predicate in `usecase.ts` omits `Number.isInteger` check

**Spec says** (`usecase.md`): "`validateSchema` — confirms all required fields exist with correct types and `confidenceScore` is an integer in `[0, 100]`."

**Code does:** `validateSchema.ts:29–33` correctly checks `Number.isInteger(llmPartial.confidenceScore)` as well as range. However, `usecase.ts:42–47` — `isValidLLMPartial` (the routing predicate) — checks only range, not `Number.isInteger`. The two validation surfaces are inconsistent: the node throws on a float like `99.9`, but if it somehow did not, the router would accept it.

**Difference:** Normal operation is unaffected (the router only runs after `validateSchema` completes without throwing), but the inconsistency means the routing predicate gives a false positive on non-integer confidence scores. The spec's `langgraph.md` example also omits the integer check from the routing predicate, so the spec itself is the source of this inconsistency.

---

### P2: `FmpService` retry logging — retry-attempt and all-retries-exhausted events absent

**Spec says** (`logging.md`): FmpService should emit `warn "Retrying {type} fetch for {ticker} — attempt {n}"` on each retry and `error "All retries exhausted for {type} fetch — {ticker}"` after all attempts fail.

**Code does:** `fmp_service.ts` delegates all retry logic to `retry()` from `src/core/retry.ts`. No retry-attempt or all-retries-exhausted log lines exist in `fmp_service.ts`. Whether these events are logged depends entirely on whether `src/core/retry.ts` emits them internally, which is outside this scope.

**Difference:** The spec places logging responsibility on `fmp_service.ts` itself, not the shared utility. If `retry.ts` does not emit these events, both required log lines are entirely absent.

---

### P3: `AiService` — "Model used" is logged as a metadata field, not a distinct log event

**Spec says** (`logging.md`): After the LLM call, log `info` "Model used" with the model name as a separate event from the generation duration.

**Code does:** `ai_service.ts:186` — `logger.info(\`LLM summary generated for ${ticker} in ${durationMs}ms\`, { modelName })`. The model name is present as a structured metadata field on the duration log line rather than as a distinct log event.

**Difference:** Two separate `info` events prescribed by the spec are collapsed into one. Queries targeting a dedicated "Model used" log event will find nothing; the model name is only discoverable by inspecting the metadata of the duration log.

---

### P4: `fmp_service.ts` — "empty result" log message contains a duplicated ticker

**Spec says** (`logging.md`): `"No {type} found for {ticker} in {startDate}–{endDate}"`.

**Code does:** `fmp_service.ts:53` — `"No news found for ${ticker} (${ticker}) in ${startDate}–${endDate}"`. The same double-ticker pattern appears for 8-Ks and EOD prices. The `(${companyName})` slot was never wired up — it falls back to the ticker variable, producing a redundant repetition.

**Difference:** Every empty-result warning message contains `{ticker} ({ticker})` instead of just `{ticker}`. The `companyName` is not available in `FmpService` method signatures, so it cannot be substituted without a signature change (see Undocumented U8).

---

## Undocumented Behaviour

### U1: `trigger.ts` — `getFirebaseAdmin()` called at module load time

**Code does:** `trigger.ts:9` calls `getFirebaseAdmin()` at module scope (outside any handler function), initialising the Firebase Admin SDK at cold-start.

**Not in spec:** `trigger.md` does not mention this initialisation call or specify when it should occur.

**Recommendation:** Intentional and correct for Cloud Functions. Add a note to `trigger.md` documenting the cold-start initialisation.

---

### U2: `usecase.ts` — services instantiated and graph compiled at module scope

**Code does:** `usecase.ts:81–85` — `FmpService`, `AiService`, and `FirestoreService` are constructed and `buildGraph(...)` is called at module level, exporting the compiled `graph` as a module-level constant. `trigger.ts:7` imports `{ graph }` directly.

**Not in spec:** `langgraph.md` says "The graph is compiled once per cold-start" (correct) but presents `buildGraph` as called from inside the trigger. `trigger.md` says the trigger "Instantiates FmpService, AiService, FirestoreService" and calls `graph.invoke` — implying per-invocation construction. The actual module-singleton pattern is not documented.

**Recommendation:** Update `trigger.md` and `langgraph.md` to document the module-level singleton pattern explicitly. The current code is architecturally correct; the specs just describe a different (per-invocation) pattern.

---

### U3: `trigger.ts` — `weeklyRecapScheduler` uses a per-company loop with individual error catching

**Code does:** `trigger.ts` (scheduler handler) — iterates over `companies`, calls `queueCompanies([company])` per company inside a `try/catch`, increments a `queued` counter, and skips failures. This is the per-company error isolation mechanism.

**Not in spec:** `trigger.md` describes step 2 as a single call: "Calls `PubSubService.queueCompanies(companies)` once with the full array." `pubsub-service.md` says `queueCompanies` "Throws if the Pub/Sub client fails (caught and logged by the scheduler)" — implying the entire-batch throw is caught, not individual ones. Neither document describes the per-company loop.

**Recommendation:** Align spec and code. Either update the spec to describe the per-company loop pattern, or move the iteration and error isolation back inside `queueCompanies` so the spec's single-call contract is honoured.

---

### U4: ~~`evaluateSummary.ts` — `AiService.sendTrace` method not documented~~ *(resolved)*

`evaluateSummary.ts` and `AiService.sendTrace` have been removed. Tracing is now handled by `EvaluationService.wrapCall` inside the `summarizeNews` node, wrapping the live LLM call. All tracing integration is documented in `evaluation-service.md`.

---

### U5: `ai_service.ts` — DeepEval cold-start initialisation via `initDeepEval()`

**Code does:** `ai_service.ts:74–98` — `initDeepEval()` is invoked immediately at module load (line 94), fetching `CONFIDENT_API_KEY` from Secret Manager and calling `monitor({ apiKey })`. A module-level `deepEvalInitialized` boolean guards against re-initialisation. All errors are swallowed with a `warn` log, gracefully disabling tracing.

**Not in spec:** No spec document describes this cold-start initialisation, the `CONFIDENT_API_KEY` access within `AiService`, the `monitor()` call, or the graceful-degradation behaviour when the key is unavailable.

**Recommendation:** Add a "DeepEval Initialisation" section to `ai-service.md` documenting the cold-start pattern and the silent-fallback behaviour.

---

### U6: `validateSchema.ts` — non-empty string constraint applied to all text fields

**Code does:** `validateSchema.ts:23–25` checks that `messageTitle`, `messageShortSummary`, and `messageLongSummary` are both `typeof === 'string'` AND `.length > 0`.

**Not in spec:** `usecase.md` says "confirms all required fields exist with correct types." `langgraph.md`'s `isValidLLMPartial` example checks only `typeof`. Neither specifies that empty strings fail validation.

**Recommendation:** Intentional and correct. Add the non-empty constraint to the spec description of `validateSchema` and to the `validateSchema` test cases in `testing.md`.

---

### U7: `calculateDeterministicFields.ts` — prices array sorted before movement calculation

**Code does:** `calculateDeterministicFields.ts:24` sorts `prices` ascending by `date` string before extracting `startPrice` (first) and `endPrice` (last).

**Not in spec:** `usecase.md` says only "derives `priceMovement` from the `prices` array." The sort is not mentioned. `data-models.md` does not specify the ordering of `StockPrice[]` returned by FMP.

**Recommendation:** Add to spec — document that prices are sorted ascending by `date` before movement calculation, and note the assumption about FMP response ordering.

---

### U8: `fmp_service.ts` — `companyName` unavailable in method signatures; logging spec is irreconcilable

**Code does:** All three `FmpService` methods (`getNews`, `get8Ks`, `getEodStockPrice`) have signature `(ticker, startDate, endDate)`. `companyName` is not a parameter and is not accessible within these methods.

**Not in spec (as a conflict):** `logging.md` prescribes FmpService log messages that include `{companyName}`. `fmp-service.md` defines method signatures without `companyName`. The two spec documents are irreconcilable as written.

**Recommendation:** Resolve the spec conflict — either remove `companyName` from FMP log message formats in `logging.md`, or add `companyName` as a fourth parameter to all `FmpService` methods in `fmp-service.md`. The implementation follows `fmp-service.md`'s signatures, which is the correct choice given that `companyName` is not semantically required for FMP API calls.

---

## Conforming Claims

71 claims verified as conforming — no issues.

Key conforming areas include:

- `weeklyRecapScheduler` config: `onSchedule`, schedule `'0 16 * * 5'`, timezone `America/New_York`, memory `256MiB`, timeout `60s`.
- `weeklyRecapProcessor` config: `onMessagePublished`, topic `weekly-recap`, memory `512MiB`, timeout `300s`.
- `weeklyRecapProcessor` unrecoverable error handling: catches, logs `"Graph execution failed for {ticker} ({companyName}) — message acked, no retry"`, returns without re-throwing.
- All four data model interfaces (`NewsArticle`, `Filing8K`, `StockPrice`, `PriceMovement`) match spec exactly in field names, types, and nullability.
- `LLMResponse` interface matches spec including `eightKCount` TypeScript name vs `'8kCount'` Firestore field (correctly handled in `firestore_service.ts:54`).
- `WeeklyRecapStateAnnotation` matches spec — all 12 state fields, `Annotation.Root` pattern, and exported `WeeklyRecapState` type.
- Graph node set and edge wiring match `langgraph.md` exactly: 8 nodes, correct edge order, `storeSummary` → END.
- `routeAfterValidation` conditional routing: `'continue'` → `assembleResponse`, `'end'` → `END`.
- `calculateWeekWindow`: `endDate` = current ISO datetime, `startDate` = 7 days prior (ISO string).
- `fetchMarketData`: uses `Promise.allSettled` (not `Promise.all`), defaults rejected calls to `[]`, writes `news`, `filings`, `prices` to state.
- `calculateDeterministicFields`: counts from array lengths, `priceMovement` with all null fields when prices is empty, rounding to 2 dp.
- `summarizeNews` node: calls `AiService.summarizeNews` with all nine arguments in the correct order.
- `validateSchema`: throws `AppError` on field failure with field name + actual value in message, logs `"Schema valid for {ticker}"` on success.
- `assembleResponse`: merges `llmPartial` + deterministic fields; LLM fields cannot overwrite `ticker`, `companyName`, `time`, `counts`, `priceMovement`.
- `postProcessResponse`: delegates to `AiService.postProcessLlmSummary`, returns new object.
- `storeSummary`: calls `FirestoreService.storeSummaryInDb`, returns `{}`, transitions to END.
- `summarizeNews` node: wraps `AiService.summarizeNews` with `EvaluationService.wrapCall` — tracing is inline, not a separate terminal node.
- `AiService.summarizeNews` retry config: `maxAttempts: 3`, `initialDelayMs: 2000`, `backoffFactor: 2`, `maxDelayMs: 30000`.
- `AiService.summarizeNews`: `responseMimeType: 'application/json'` in `generationConfig`.
- `AiService.summarizeNews`: model name resolved from `appConfig.weekly_recap.model` via `getRemoteConfig()` at call time (hot-swappable).
- `SUMMARIZE_NEWS_PROMPT` exported constant with all 12 specified `{variable}` placeholders; prompt enforces all field constraints.
- Token truncation: news at 500 tokens; 8-K entries and prices not truncated.
- `AiService.summarizeNews` logging: `debug` prompt before call, `debug` raw response after, `info` generation duration, `info` token usage (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`), `warn` empty response.
- `AiService.postProcessLlmSummary`: trims whitespace from all string fields, hard-truncates `messageTitle` to 50 chars, strips markdown from `messageLongSummary`, returns new object (does not mutate input), logs truncation and markdown-strip events at correct levels.
- `FirestoreService` logger context `'WeeklyRecap/Storage/FirestoreService'`.
- `FirestoreService.retrieveCompaniesFromDb`: reads `watchlist` collection, maps all docs to `Company[]`, returns `[]` for empty collection, logs `"Retrieved {n} companies from watchlist"`.
- `FirestoreService.storeSummaryInDb`: path `weekly_recap/{ticker}/weeks/{weekEndDate}`, document ID from `response.time.slice(0, 10)`, `createdAt: FieldValue.serverTimestamp()` merged, `set()` without merge option, Firestore field `'8kCount'` mapped from `response.eightKCount`, logs `"Stored summary for {ticker} / {weekEndDate}"`.
- `FmpService` logger context `'WeeklyRecap/Storage/FmpService'`; retry config (`maxAttempts: 3`, `initialDelayMs: 1000`, `backoffFactor: 2`, `maxDelayMs: 30000`); `shouldRetry: isTransientError`.
- `FmpService.getNews`: URL pattern matches spec exactly, `limit=30`, maps to `NewsArticle`.
- `FmpService.get8Ks`: URL pattern matches spec exactly, `limit=20`, client-side filter `formType === '8-K'`, maps to `Filing8K`.
- `FmpService.getEodStockPrice`: URL pattern matches spec exactly, maps `date`, `price`, `volume` to `StockPrice`.
- `PubSubService` logger context `'WeeklyRecap/Storage/PubSubService'`, topic `'weekly-recap'`.
- `PubSubService.retrieveCompanyFromQueue`: decodes base64, parses JSON, validates `ticker` and `companyName` as strings, throws typed `AppError` on missing fields.
- Graph compiled once at cold-start (module level), not per invocation.
- Logger context naming convention `WeeklyRecap/Storage/{FileName}` followed throughout all files.
- `AppError` used for typed errors in `validateSchema.ts` and `pubsub_service.ts`.
- Secret Manager access pattern used for `CONFIDENT_API_KEY` in `AiService` matching `tech-stack.md` mandatory pattern.
