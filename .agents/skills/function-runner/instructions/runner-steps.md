---
name: Function Runner Steps
description: Interactive process for executing Cloud Functions locally via the Firebase Emulator Suite.
---

# Function Runner Steps

Follow these steps to interactively run and verify Cloud Functions in the local shell.

---

## Phase 1: Environment & Context Analysis

1.  **Select Environment**: Ask the user which Firebase project alias (`dev`, `qa`, `prod`) to target.
2.  **Switch Alias**: Run `firebase use [alias]`.
3.  **Identify Exports**: Read `src/index.ts` to identify the specific function name and trigger type (HTTP, Scheduled, etc.).

---

## Phase 2: Local Execution

1.  **Start Shell**: Run `npm run shell`.
2.  **Invoke Function**:
    -   For background triggers: `functionName({ data: ... })` or `functionName()`.
    -   For HTTP triggers: Use the `.get()` or `.post()` helpers within the shell.
3.  **Monitor Logs**: Observe the execution logs for completion or error status.

---

## Phase 3: Verification & Recovery

1.  **Standard Success**: Direct the user to verify the side effects in the Firestore console or local emulator database.
2.  **Error Recovery**: If failure occurs, analyze the stack trace:
    -   **Permission Denied**: Check gcloud auth (`gcloud auth login`).
    -   **Not Found**: Check if the database/resource exists in the target environment.
    -   **Timeout**: Increase `timeoutSeconds` in the function configuration.
3.  **Exit**: To terminate the session, use `.exit`.

---

## Verification Checklist

- [ ] Target environment alias is correctly selected via `firebase use`.
- [ ] Function name matches the export in `src/index.ts`.
- [ ] Execution logs are analyzed for "Finished" status.
- [ ] No `console.log` leftovers are found in the final output (use core Logger).
- [ ] All paths are project-root-relative.
