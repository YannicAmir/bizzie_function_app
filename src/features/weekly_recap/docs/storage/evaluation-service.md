# services/evaluation_service.ts

Handles all Confident AI / DeepEval tracing. Observability concern — wraps live LLM calls so traces capture the actual inference, not a post-hoc response object.

Logger instantiated as `new Logger('WeeklyRecap/Storage/EvaluationService')` from `src/core/logger.ts`.

---

## Initialisation

`CONFIDENT_API_KEY` is declared with `defineSecret` in `trigger.ts` and bound to `weeklyRecapProcessor`. Firebase injects it as `process.env.CONFIDENT_API_KEY` at runtime — locally from `.secret.local`, deployed from GCP Secret Manager.

| Secret | GCP Secret Manager key |
|---|---|
| `CONFIDENT_API_KEY` | Confident AI API key |

`await evaluationService.init()` is called at the start of each `weeklyRecapProcessor` invocation (inside the handler, not at module scope). Secrets are only available inside the handler. Subsequent warm-start invocations hit the `if (this._initialized) return` guard immediately.

---

## Properties

### `isInitialized: boolean` (getter)

Read-only. Returns `true` after `init()` has called `traceManager.configure` successfully. Used by `AiService` to decide whether to wrap LLM calls with `observe` spans.

---

## Functions

### `init(): Promise<void>`

Guards with `if (this._initialized) return` so warm-start invocations are free. Reads `process.env.CONFIDENT_API_KEY`. If present, calls `traceManager.configure({ confidentApiKey: apiKey, tracingEnabled: true })` from `deepeval/tracing` and sets `_initialized = true`. If absent, logs a warning and returns — tracing is disabled for the lifetime of the instance. Errors from `configure` are caught and logged as `warn` (same disabled outcome).

---

## Usage

`EvaluationService` is constructed at module scope in `trigger.ts`, then injected into `AiService`. Initialization (which needs the secret) is awaited inside the handler:

```typescript
// module scope (cold-start)
const evaluationService = new EvaluationService();
const aiService = new AiService(evaluationService);

// inside weeklyRecapProcessor handler (secret available here)
await evaluationService.init();
```

`AiService.summarizeNews` calls `evaluation.isInitialized` to decide whether to wrap LLM calls with `observe` spans. See [ai-service.md](ai-service.md) for the trace call details.

---

## Env Vars

| Variable | Source | Purpose |
|---|---|---|
| `CONFIDENT_API_KEY` | Firebase Secret (GCP Secret Manager) | Confident AI API key; injected at function invocation time via `defineSecret` |
| `DEEPEVAL_RESULTS_FOLDER` | Optional env var | Override folder for DeepEval result output (not required at runtime) |
