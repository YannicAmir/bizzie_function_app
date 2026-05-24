# Logging Spec

All logging uses `Logger` from `src/core/logger.ts`. Each file instantiates its own logger with a descriptive context name so every log line is identifiable in Cloud Logging.

```typescript
const logger = new Logger('WeeklyRecap/Storage/FmpService');   // example
```

Each file uses `new Logger(context)` from `src/core/logger.ts`. Context naming convention: `WeeklyRecap/Storage/{FileName}`.

**Every log line includes the logger context as the `service` field**, so you always know which file emitted it — no need to manually include the service name inside the message string.

---

## `storage/trigger.ts` — `WeeklyRecap/Storage/Trigger`

| Event | Level | Message |
|---|---|---|
| Scheduler started | `info` | `"Scheduler started"` |
| Companies loaded | `info` | `"Loaded {n} companies from watchlist"` |
| Watchlist empty | `warn` | `"Watchlist is empty — nothing to process"` |
| All messages queued | `info` | `"Queued {n}/{total} Pub/Sub messages in {ms}ms"` |
| Processor message received | `info` | `"Processing {ticker} ({companyName})"` |
| Processor completed | `info` | `"Completed {ticker} ({companyName})"` |
| Processor unrecoverable error | `error` | `"Graph execution failed for {ticker} ({companyName}) — message acked, no retry"` + error |

---

## `storage/services/pubsub_service.ts` — `WeeklyRecap/Storage/PubSubService`

| Event | Level | Message |
|---|---|---|
| Per-company publish failure | `error` | `"Failed to queue {ticker} ({companyName}) — skipping"` + error |
| Batch complete | `info` | `"Published {n}/{total} Pub/Sub messages"` |

---

## `storage/services/fmp_service.ts` — `WeeklyRecap/Storage/FmpService`

| Event | Level | Message |
|---|---|---|
| Each API call start | `info` | `"Fetching {news|8Ks|eodPrices} for {ticker}"` |
| Each API call result | `info` | `"Fetched {n} {type} for {ticker}"` |
| Empty result | `warn` | `"No {type} found for {ticker} in {startDate}–{endDate}"` |
| Retry attempt | `warn` | `"Retrying {type} fetch for {ticker} — attempt {n}"` |
| All retries exhausted | `error` | `"All retries exhausted for {type} fetch — {ticker}"` + error |

---

## `storage/services/evaluation_service.ts` — `WeeklyRecap/Storage/EvaluationService`

| Event | Level | Message |
|---|---|---|
| Key absent | `warn` | `"CONFIDENT_API_KEY not set — DeepEval tracing disabled"` |
| Init failed | `warn` | `"DeepEval initialization failed — tracing disabled"` + error |

---

## `storage/services/ai_service.ts` — `WeeklyRecap/Storage/AiService`

LLM calls require the most detailed logging to diagnose why the model produced a given output.

### `summarizeNews`

| Event | Level | What to log |
|---|---|---|
| Before call | `debug` | Full prompt string sent to the model |
| After call | `debug` | Full raw response text from the model |
| Generation duration | `info` | `"LLM summary generated for {ticker} in {ms}ms"` |
| Token usage | `info` | `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount` from `result.response.usageMetadata` |
| Model used | `info` | Model name resolved from Remote Config |
| Empty response | `warn` | `"LLM returned empty response for {ticker}"` |
| Invalid schema | `warn` | `"LLM returned invalid schema for {ticker}"` + raw parsed value |

### `postProcessLlmSummary`

| Event | Level | Message |
|---|---|---|
| Title truncated | `info` | `"messageTitle truncated for {ticker}: {originalLength} → 50 chars"` |
| Markdown stripped | `debug` | `"Stripped markdown artefacts from summary for {ticker}"` |

---

## `storage/usecase.ts` + `storage/nodes/` — `WeeklyRecap/Storage/Node/{NodeName}`

| Event | Level | Message |
|---|---|---|
| Schema valid | `info` | `"Schema valid for {ticker}"` |
| Schema invalid (per field) | `error` | `"Schema validation failed for {ticker}: field "{field}" is invalid"` + field name + JSON-serialised value |
| `summarizeNews` node failure | `error` | `"summarizeNews failed"` + ticker + error |
| `storeSummaryInDb` node failure (after retries) | `error` | `"storeSummaryInDb failed after retries"` + ticker + error |

---

## `storage/services/firestore_service.ts` — `WeeklyRecap/Storage/FirestoreService`

| Event | Level | Message |
|---|---|---|
| `retrieveCompaniesFromDb` success | `info` | `"Retrieved {n} companies from watchlist"` |
| `storeSummaryInDb` success | `info` | `"Stored summary for {ticker} / {weekEndDate}"` |
| Any Firestore error | `error` | Operation name + ticker + error |
