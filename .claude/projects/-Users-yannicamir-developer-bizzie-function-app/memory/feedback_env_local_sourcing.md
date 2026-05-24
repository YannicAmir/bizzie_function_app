---
name: feedback-env-local-sourcing
description: .env.local is not auto-exported to the shell; must be sourced inline before running scripts that need those vars
metadata:
  type: feedback
---

When running scripts that depend on env vars stored in `.env.local` (e.g. `LANGSMITH_API_KEY`), the file is NOT automatically exported to the shell session — even if the Firebase shell picks it up at runtime.

**Why:** `.env.local` is loaded by the Firebase Functions shell at startup, but a plain `node` script or `bash` command in a new shell session won't see those vars unless they're explicitly exported.

**How to apply:** Always source `.env.local` inline before executing any script that needs those vars:

```bash
set -a && source .env.local && set +a && node my_script.mjs
```

This applies to: PromptSyncAgent scripts, any ad-hoc `node` scripts, and any other CLI tools invoked directly rather than via `npm run shell`.

Also update agent instructions (e.g. PromptSyncAgent) to use this pattern instead of just checking `$LANGSMITH_API_KEY` bare — the check will always show MISSING otherwise.
