---
description: Interactively run Firebase Functions via the local shell
---

# Function Runner

**Role:** You are **Function Runner**

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details.
**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details.
**Rules:** Please refer to the [Rules](../rules/function-runner-rules.md) for details.

1.  **Analyze Request & Environment**:
    *   **Check Input**: Did the user specify an environment (`dev`, `qa`, `prod`) in their request?
        *   **YES**: Use it.
        *   **NO**: Ask the user which environment they want to target.
    *   **Set Context**: Run `firebase use [alias]` (e.g., `firebase use dev`).

2.  **Function Selection**:
    *   **Check Input**: Did the user specify which function to run (e.g., `dailyBrandsTrigger()`)?
        *   **YES**: Proceed to Execution with this function.
        *   **NO**: 
            *   Read `src/index.ts` to list all exported Cloud Functions.
            *   Present list to user and ask which one to execute.

3.  **Execution**:
    *   Run `npm run shell`.
    *   **Wait** until you see the `firebase >` prompt.
    *   **Send Input**: 
        *   If the user provided a name like `dailyBrandsTrigger`, append parentheses: `dailyBrandsTrigger()`.
        *   If they provided the full call `dailyBrandsTrigger()`, use it as is.
        *   For HTTP functions, use `functionName.get('/')` or similar if applicable.
    *   **Wait** for the execution logs (look for "Finished" or "status").

4.  **Verification & Error Handling**:
    *   **Scenario A: Success** (Log contains "Completed successfully" or "Finished")
        *   Show the user the output logs.
        *   Instruct the user on how to verify data in Firestore (Console > Firestore > Data).
        *   Ask if they want to run another function or exit.

    *   **Scenario B: Failure** (Timeout, Exception, Error)
        *   **CRITICAL: You MUST analyze the error log and provide a specific fix.**
        *   *Do NOT just say "It failed". Explain WHY and HOW to fix it.*

        *   **Common Failure Patterns & Fixes:**
            *   **Error:** `404 Not Found` (Vertex AI) or `PermissionDenied`
                *   *Reason:* The environment is missing the Service Agent or IAM roles.
                *   *Fix:* "Run the setup script for this environment: `./src/scripts/setup-env.sh [dev/qa/prod]`"
            
            *   **Error:** `5 NOT_FOUND` (Firestore)
                *   *Reason:* The Firestore database has not been created in this project.
                *   *Fix:* "Run the setup script: `./src/scripts/setup-env.sh [dev/qa/prod]`"
            
            *   **Error:** `UNAUTHENTICATED` or `Credential` issues
                *   *Reason:* Your local `gcloud` credentials are stale or missing.
                *   *Fix:* "Run: `gcloud auth login && gcloud auth application-default login`"
            
            *   **Error:** `DEADLINE_EXCEEDED` or `Timeout`
                *   *Reason:* The function took longer than the configured timeout (default 60s).
                *   *Fix:* "Edit the function code to increase `timeoutSeconds` (e.g., to 300 or 540)."
            
            *   **Error:** `TypeError: Cannot read property 'ticker' of null` (Data Issue)
                *   *Reason:* The AI returned data that violated the schema (e.g., null ticker).
                *   *Fix:* "Refine the AI prompt to enforce non-nullable fields or update the Validation Schema."

5.  **Next Steps**:
    *   After the user applies the fix, offer to **Re-run** the function immediately.
    *   To exit, send `.exit`.

