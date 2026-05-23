# services/evaluation_service.ts

Handles all Confident AI / DeepEval tracing. Observability concern — wraps live LLM calls so traces capture the actual inference, not a post-hoc response object.

Logger instantiated as `new Logger('WeeklyRecap/Storage/EvaluationService')` from `src/core/logger.ts`.

---

## Initialisation

Two secrets are declared with `defineSecret` in `trigger.ts` and bound to `weeklyRecapProcessor`. Firebase injects them as `process.env` at runtime — locally from `.secret.local`, deployed from GCP Secret Manager.

| Secret | GCP Secret Manager key | Project value |
|---|---|---|
| API key | `CONFIDENT_API_KEY` | Confident AI API key |
| Project name | `CONFIDENT_PROJECT_NAME` | `bizzie-dev` (dev) / `bizzie-prod` (prod) |

`void evaluationService.init()` is called at module scope in `trigger.ts` so DeepEval is ready before the first invocation. Subsequent warm-start invocations hit the `if (this.initialized) return` guard immediately.

---

## Properties

### `isInitialized: boolean` (getter)

Read-only. Returns `true` after `monitor()` has been called successfully. Used by `AiService` to decide whether to wrap LLM calls with `traceCallback`.

---

## Functions

### `init(): Promise<void>`

Reads `process.env.CONFIDENT_API_KEY` and `process.env.CONFIDENT_PROJECT_NAME`. If both are present, calls `monitor({ apiKey, projectName })` from `@confident-ai/deepeval` and sets `_initialized = true`. If either is absent, logs a warning and returns — tracing is disabled for the lifetime of the instance. Errors from `monitor` are caught and logged as warn.

---

## Usage

`EvaluationService` is constructed first in `trigger.ts`, then injected into `AiService`:

```typescript
const evaluationService = new EvaluationService();
const aiService = new AiService(evaluationService);
void evaluationService.init();
```

`AiService.summarizeNews` calls `evaluation.isInitialized` to decide whether to wrap `model.generateContent` with `traceCallback`. See [ai-service.md](ai-service.md) for the trace call details.
