---
name: FCM Service Builder Instructions
description: Step-by-step procedure for FcmServiceBuilder to implement services/fcm_service.ts using firebase-admin sendEachForMulticast with APNS config, partial failure handling, retry, and structured logging.
---

# Instructions for FcmServiceBuilder

## Role

FCM specialist. Receive an fcm-service.md spec path and feature directory from SpecBuildExecutor. Read the spec and best practice instructions, then implement `services/fcm_service.ts` following both exactly.

## Steps

1. Receive the fcm-service.md spec path and feature directory from SpecBuildExecutor.

2. Read the `fcm-service.md` spec doc in full. Note the exported interface: method names, parameter types, and return types.

3. Read `.claude/organization/technology/shared_instructions/fcm.apns.best.practice.instructions.md` in full.

4. Read `src/core/retry.ts` to understand the retry utility signature and usage.

5. Read `src/core/logger.ts` to understand the logger instance and log levels.

6. Implement `services/fcm_service.ts` in the feature directory with the following requirements:

   **Messaging client:**
   - Use `firebase-admin` messaging.
   - Use `sendEachForMulticast` for all batched notification sends.

   **APNS configuration:**
   - Set `apns.payload.aps.alert` with `title` and `body` fields for the notification text.
   - Set `apns.payload.aps.sound` to `"default"`.

   **Data payload:**
   - Include relevant data fields in the `data` map as specified in the spec (e.g., ticker, summary excerpt, weekEndDate or equivalent feature-specific fields).

   **Partial failure handling:**
   - After calling `sendEachForMulticast`, iterate over the response array.
   - For tokens that returned an `UNREGISTERED` error code: log at `warn` level. Do NOT throw an error.
   - For other per-token errors: log at `error` level with token context.
   - Never let partial failures abort the entire send.

   **Retry:**
   - Wrap the `sendEachForMulticast` call in `retry()` from `src/core/retry.ts`.
   - Retry config: `maxAttempts: 2`, `initialDelayMs: 1000`.
   - Only retry transient errors — do NOT retry `UNREGISTERED` token errors.

   **Logging:**
   - Log each successful batch send at `info` level with token count.
   - Log `UNREGISTERED` tokens at `warn` level.
   - Log transient send failures at `error` level.

   **Interface:**
   - Export a single class or set of functions that match the spec's interface exactly — same method names, same parameter types, same return types.

7. Verify the implemented interface matches the spec: compare each method name, each parameter type, and each return type against `fcm-service.md`. Correct any mismatch before finishing.

---

## Checklist
- [ ] fcm-service.md spec read in full
- [ ] fcm.apns.best.practice.instructions.md read in full
- [ ] src/core/retry.ts read
- [ ] src/core/logger.ts read
- [ ] `firebase-admin` messaging used
- [ ] `sendEachForMulticast` used for batch sends
- [ ] `apns.payload.aps.alert` set with title and body
- [ ] `apns.payload.aps.sound` set to `"default"`
- [ ] Data payload includes spec-defined fields
- [ ] `UNREGISTERED` tokens logged at `warn` level, not thrown
- [ ] Other per-token errors logged at `error` level
- [ ] `sendEachForMulticast` wrapped with `retry()` (maxAttempts: 2, initialDelayMs: 1000)
- [ ] `UNREGISTERED` errors excluded from retry logic
- [ ] Successful batch sends logged at `info` level
- [ ] Exported interface matches spec: method names, parameter types, return types
