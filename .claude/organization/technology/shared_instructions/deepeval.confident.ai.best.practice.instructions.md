---
name: deepeval confident ai best practice
description: Best practices for Confident AI / DeepEval in this project — online LLM call tracing (fire-and-forget from Cloud Functions) and CI/CD dataset test runs via CLI. No test definitions or metric code in source files.
---

# Instructions for DeepEval / Confident AI

## Core model

There are exactly two integration points with Confident AI in this project:

1. **Online tracing** — LLM calls in Cloud Functions are traced so inputs, outputs, and metadata appear in the Confident AI dashboard for monitoring and human review.
2. **CI/CD test runs** — Datasets are created and managed in the Confident AI dashboard. Tests are executed against them via a CLI command in the CI/CD pipeline.

**There are NO test case definitions, metric classes, or evaluation logic in source code.** All of that lives in the dashboard.

---

## 1. Online tracing — SDK initialization

Initialize the `@confident-ai/deepeval` tracer once at module scope (cold-start). Load `CONFIDENT_API_KEY` from GCP Secret Manager:

```typescript
import { monitor } from '@confident-ai/deepeval';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let initialized = false;

async function initDeepEval(): Promise<void> {
  if (initialized) return;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${config.projectId}/secrets/CONFIDENT_API_KEY/versions/latest`,
  });
  const apiKey = version.payload!.data!.toString();
  monitor({ apiKey });
  initialized = true;
}
```

- `CONFIDENT_API_KEY` from GCP Secret Manager — never from env vars or hardcoded
- Call `initDeepEval()` once at cold-start in `ai_service.ts`, not per LLM call

## 2. Online tracing — instrumenting LLM calls

Wrap each LLM call so the trace (prompt input + model output + metadata) is automatically sent to the Confident AI dashboard:

```typescript
import { traceCallback } from '@confident-ai/deepeval';

// Wrap the Vertex AI generateContent call
const result = await traceCallback(
  async () => model.generateContent({ contents }),
  {
    model: modelName,
    inputTokenCount: estimatedInputTokens,
    outputTokenCount: estimatedOutputTokens,
    traceAttributes: {
      ticker: state.ticker,
      weekEndDate: state.weekEndDate,
      feature: 'weekly_recap',
    },
  },
);
```

The SDK sends trace data to the Confident AI dashboard asynchronously — you see inputs, outputs, token counts, and metadata there. No manual `LlmTestCase` construction needed.

## 3. Fire-and-forget from LangGraph nodes

Tracing must never block the main pipeline. The `evaluateSummary` LangGraph node calls the tracer in a fire-and-forget pattern:

```typescript
// nodes/evaluateSummary.ts
export function makeEvaluateSummaryNode(ai: AiService) {
  return async (state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    // Fire-and-forget — do NOT await
    ai.sendTrace(state).catch((err) => {
      logger.warn('DeepEval trace failed (non-blocking)', {
        ticker: state.ticker,
        error: (err as Error).message,
      });
    });
    return {}; // return immediately
  };
}
```

The `AiService.sendTrace()` method wraps the trace dispatch. It must never throw — always catch internally.

## 4. Error isolation

Tracing failures MUST NOT propagate to the main Cloud Function:

- Always `.catch()` the fire-and-forget trace call
- Log failures at `warn` level (not `error`) — tracing failure is non-critical
- Never re-throw from a trace handler — the Pub/Sub message must still be acknowledged
- If `initDeepEval()` fails at cold-start: log at `warn` and continue without tracing — do not crash the function

## 5. CI/CD test runs — CLI only, no source code

Datasets and test configurations live entirely in the Confident AI dashboard:
- Datasets are created, curated, and versioned in the dashboard UI
- Metrics, scoring thresholds, and LLM-as-Judge setup are configured in the dashboard
- The CI/CD pipeline triggers a run with a single CLI command:

```yaml
# In deploy-functions.yml or a separate evaluation workflow:
- name: Run DeepEval tests
  run: deepeval test run --confident-api-key ${{ secrets.CONFIDENT_API_KEY }}
```

**Do not create `deepeval` test files, `pytest` conftest files, or metric class instantiations in the source repo.** If you see any of these, they are wrong and should be removed.

## 6. Environment separation

Each GCP environment traces to its own Confident AI project:
- `dev` → `bizzie_dev`
- `qa` → `bizzie_qa`
- `prod` → `bizzie_prod`

Set the project name via the `DEEPEVAL_PROJECT` env var or pass it to `monitor()` at init. Retrieve the value from Remote Config or Secret Manager — never hardcode.

## 7. What NOT to do

- Never construct `LlmTestCase` objects in source code
- Never instantiate metric classes (`GEval`, `AnswerRelevancyMetric`, etc.) in source code
- Never write `deepeval` test files (`.test.ts`, `test_*.py`) in the feature source
- Never define datasets or test suites in code — use the dashboard
- Never await the trace call from within a LangGraph node

---

## Checklist

- [ ] `CONFIDENT_API_KEY` loaded from GCP Secret Manager at cold-start
- [ ] `initDeepEval()` / `monitor()` called once at module scope, not per invocation
- [ ] LLM calls wrapped with `traceCallback` (or equivalent) to send trace data to dashboard
- [ ] `evaluateSummary` node is fire-and-forget — no `await`, `.catch()` logs at `warn`
- [ ] Tracing failure never crashes the Cloud Function or blocks Pub/Sub acknowledgement
- [ ] No `LlmTestCase`, metric classes, or test file definitions in source code
- [ ] CI/CD runs datasets via `deepeval test run` CLI command only
- [ ] Environment project name set via config, not hardcoded
