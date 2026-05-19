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
| LLM | Google Vertex AI — Gemini (model resolved from Firebase Remote Config) |
| Orchestration | LangGraph — state graph per ticker invocation, typed `WeeklyRecapState` |
| Market data | Financial Modeling Prep (FMP) REST API — v3, v4, stable endpoints |
| LLM evaluation | Confident AI / DeepEval — LLM-as-Judge tracing via `@confident-ai/deepeval` |
| Prompt versioning | LangSmith — prompts versioned in Confident AI; local interpolation during dev |
| Secrets | GCP Secret Manager — `CONFIDENT_API_KEY`, `FMP_API_KEY`, `LANGSMITH_API_KEY` etc. |
| Retry / backoff | `src/core/retry.ts` — exponential backoff, configurable per call site |
| Logging | `src/core/logger.ts` — structured wrapper over `firebase-functions/logger` |
| Config | `src/core/remote-config.ts` — Firebase Remote Config (model names, FMP URLs) |
| Env vars | `src/core/config.ts` — `GCLOUD_PROJECT`, `LOCATION` |
| Error types | `src/core/errors.ts` — `AppError` with `code`, `status`, `retryAfterSeconds` |

---

## Retry Strategy

All outbound network calls are wrapped in `retry()` from `src/core/retry.ts`:

```
retry<T>(fn, { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs, shouldRetry })
```

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
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

**Accessing a secret (standard pattern across all features):**
```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
const client = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
  const [version] = await client.accessSecretVersion({
    name: `projects/${config.projectId}/secrets/${name}/versions/latest`,
  });
  return version.payload!.data!.toString();
}
```

---

## Token Budget

Text content from FMP (news `text`, press release `text`) is truncated per item before the prompt is assembled. 8-K data is metadata only (no full document fetched). Stock prices are a handful of rows and need no truncation.

| Input | Limit | Rationale |
|---|---|---|
| News article text | 500 tokens (~375 words) | Captures headline + key facts; tail of long articles is rarely material |
| Press release text | 750 tokens (~560 words) | Denser structured content; needs more room |
| 8-K entry | No truncation | Metadata only: title, date, two URLs — ~30 tokens per entry |
| Stock price entry | No truncation | Three fields per trading day — ~15 tokens per entry |

**Estimated tokens per invocation:** ~500 (prompt) + 15,000 (30 news) + 22,500 (30 PRs) + 600 (20 8-K entries) + 110 (7 price rows) + 20 (price movement) ≈ **38,750 input tokens**. Output JSON ≈ 500 tokens. At Gemini Flash pricing this is ~$0.003 per ticker.

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| `evaluateSummary` in-process vs separate job | In-process, fire-and-forget SDK call. Confident AI receives traces automatically — no separate queue needed. See [evaluation.md](evaluation.md). |
| LLM evaluation metrics | Configured in the Confident AI dashboard per project, not in code. DeepEval SDK sends trace data; metric definition, scoring, and LLM-as-Judge are managed on the Confident AI platform. See [evaluation.md](evaluation.md). |
| Remote Config model key | `weekly_recap_model` (dedicated key, already added to dev/qa/prod Remote Config). Default: `gemini-3-flash-preview`. |
| Dead-letter topic setup | Required before going to production. See [dead-letter-setup.md](dead-letter-setup.md) for step-by-step instructions. |
