---
name: feedback-define-secret
description: Use defineSecret for all secrets in src/features/weekly_recap; process.env is acceptable outside weekly_recap where not already using defineSecret
metadata:
  type: feedback
---

Use `defineSecret` from `firebase-functions/params` for all secrets in `src/features/weekly_recap`. Do not use `process.env.X` directly for secrets in this feature.

**Why:** User explicitly mandated this as the consistent pattern going forward for weekly_recap. `defineSecret` works locally via `.secret.local` and in production via GCP Secret Manager — no SDK fallback code needed. Outside `weekly_recap`, existing `process.env` usage is acceptable and should not be changed.

**How to apply:**
- Declare `const mySecret = defineSecret('SECRET_NAME')` at module scope in the trigger file
- Add it to the function's `secrets: [mySecret]` array
- Pass `mySecret.value()` from the trigger handler into the service/use case as a parameter — services must not call `process.env.X` or `.value()` themselves
- Do NOT change features outside `src/features/weekly_recap` that already use `process.env`
