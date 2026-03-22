# Function Runner Rules

## Constraints
- **Shell Interaction**: You must use the `npm run shell` command to interact with functions locally.
- **Environment Selection**: You must explicitly ask the user which Firebase project alias (`dev`, `qa`, `prod`) they wish to target before running the shell.
- **Verification**: You must guide the user to verify the results in Firestore (locally or in the console depending on the mode).
- **Existing Triggers**: You must check `src/index.ts` to see which functions are actually exported.

## Naming Conventions
- Run functions by their exported name, e.g., `dailyBrandsTrigger()`.

---

## Workflow

### Step 1: Analyze Request & Environment
- Did the user specify an environment (`dev`, `qa`, `prod`)?
    - **YES**: Use it.
    - **NO**: Ask the user which environment to target.
- Run `firebase use [alias]` (e.g., `firebase use dev`).

### Step 2: Function Selection
- Did the user specify which function to run?
    - **YES**: Proceed to execution.
    - **NO**: Read `src/index.ts` to list all exported Cloud Functions; present the list and ask which one to execute.

### Step 3: Execution
- Run `npm run shell`.
- Wait until the `firebase >` prompt appears.
- Send the function call:
    - If the user gave a name like `dailyBrandsTrigger`, append parentheses: `dailyBrandsTrigger()`.
    - If they gave the full call already, use it as-is.
    - For HTTP functions, use `functionName.get('/')` or similar.
- Wait for execution logs (look for "Finished" or "status").

### Step 4: Verification & Error Handling

**Scenario A: Success** — logs contain "Completed successfully" or "Finished"
- Show the user the output logs.
- Instruct them to verify data in Firestore (Console > Firestore > Data).
- Ask if they want to run another function or exit.

**Scenario B: Failure** — timeout, exception, or error
- Analyze the error log and provide a specific fix. Do NOT just say "It failed" — explain WHY and HOW to fix it.

**Common failure patterns:**

| Error | Reason | Fix |
|---|---|---|
| `404 Not Found` (Vertex AI) or `PermissionDenied` | Missing Service Agent or IAM roles | Run the setup script for this environment |
| `5 NOT_FOUND` (Firestore) | Firestore database not created | Run the setup script |
| `UNAUTHENTICATED` or credential issues | Stale or missing local gcloud credentials | `gcloud auth login && gcloud auth application-default login` |
| `DEADLINE_EXCEEDED` or Timeout | Function took longer than configured timeout | Increase `timeoutSeconds` in the function code (e.g., 300 or 540) |
| `TypeError: Cannot read property ... of null` | AI returned data violating the schema | Refine the AI prompt or update the validation schema |

### Step 5: Next Steps
- After the user applies the fix, offer to re-run the function immediately.
- To exit the shell, send `.exit`.
