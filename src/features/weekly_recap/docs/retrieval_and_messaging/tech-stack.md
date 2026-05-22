# Tech Stack & Retry Strategy

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.x (strict mode) |
| Cloud Functions | Google Cloud Functions 2nd Gen (`firebase-functions/v2`) |
| Scheduling | Google Cloud Scheduler |
| Message queue | Google Cloud Pub/Sub — topic: `weekly-recap-delivery` |
| Push notifications | Firebase Cloud Messaging (FCM) — APNS delivery |
| User claim store | Redis Cloud (redis.io, GCP us-central1) via `ioredis` — ephemeral deduplication via `GETDEL` |
| Database | Google Cloud Firestore — read-only from this pipeline |
| Secrets | GCP Secret Manager — `REDIS_URL`, `REDIS_CA_CERT`, and other credentials |
| Retry / backoff | `src/core/retry.ts` — exponential backoff, configurable per call site |
| Logging | `src/core/logger.ts` — structured wrapper over `firebase-functions/logger` |
| Config | `src/core/config.ts` — `GCLOUD_PROJECT`, `LOCATION` |
| Error types | `src/core/errors.ts` — `AppError` with `code`, `status`, `retryAfterSeconds` |

---

## Retry Strategy

All outbound network calls are wrapped in `retry()` from `src/core/retry.ts`:

```
retry<T>(fn, { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs, shouldRetry })
```

| Call site | maxAttempts | initialDelayMs | backoffFactor | Delay series |
|---|---|---|---|---|
| Firestore reads (`firestore_service.ts`) | 3 | 1000ms | 2 | 1s → 2s → throw |
| Redis operations (`redis_service.ts`) | 3 | 500ms | 2 | 0.5s → 1s → throw |
| FCM send (`fcm_service.ts`) | 2 | 1000ms | 2 | 1s → throw |

**Transient errors (retried):** HTTP 429, 500, 503 · `UNAVAILABLE` · `DEADLINE_EXCEEDED` · network failures.

**Permanent errors (not retried):** HTTP 400, 401, 403, 404 — bad credentials, malformed request, stale FCM token (`UNREGISTERED`).

**Per-ticker failure isolation:** Errors in `weeklyRecapDeliveryProcessor` are caught and logged rather than re-thrown, so the Pub/Sub message is acknowledged and processing continues for other tickers. Persistent per-ticker failures route to the dead-letter topic on `weekly-recap-delivery` after 5 attempts.

---

## Environment & Secret Management

Bizzie runs three fully isolated environments — **dev**, **qa**, and **prod** — each backed by its own Firebase project and GCP project. All infrastructure (Firestore, Pub/Sub, Cloud Functions, Secret Manager, Redis) is provisioned per-environment with no cross-environment data access.

**Secret pattern (mandatory for all implementations):**

| Rule | Detail |
|---|---|
| Secret names are identical across environments | `REDIS_URL` is the same string in dev, qa, and prod GCP Secret Manager |
| GCP project context resolves the correct value | Functions run inside their environment's GCP project — Secret Manager automatically returns that project's secret |
| No environment conditionals in code | Never branch on `process.env.ENV` to pick a secret value; the GCP project boundary handles isolation |
| Secrets fetched at cold-start | Each secret is fetched once per function instance and cached for the lifetime of the instance |
| API keys are never in Remote Config or env vars | Remote Config holds non-sensitive config; Secret Manager holds all credentials |

**Redis hosting:**

Redis Cloud (redis.io) hosted on GCP us-central1. No VPC Connector required. Connection uses TLS (`rediss://` scheme) — both `REDIS_URL` and `REDIS_CA_CERT` must be fetched from Secret Manager at cold-start and passed to the `ioredis` client. 

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| Deduplication mechanism | Redis `GETDEL` — atomic claim per user. Guarantees each user is notified at most once per week, even with concurrent processor invocations. |
| When to load Redis | Scheduler loads Redis **before** publishing Pub/Sub messages. Processors cannot start before Redis is ready. |
| FCM token cleanup | Out of scope for this pipeline. Stale `UNREGISTERED` tokens are logged at `warn`; removal is a separate maintenance concern. |
| Pub/Sub payload size | Only the 5 fields needed for delivery are in the message. Full summary is fetched by the app from Firestore on open — not in the push payload. |
| Dead-letter topic | `weekly-recap-delivery-dead-letter` — configured identically to the storage pipeline's dead-letter topic. See [../../storage/dead-letter-setup.md](../../storage/dead-letter-setup.md). |
