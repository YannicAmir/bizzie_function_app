# Manual Verification for Retry Logic

This guide outlines how to manually verify the retry logic implemented in the `daily_brands` feature. Since transient network errors are hard to reproduce on demand, we verify by simulating failures.

## Prerequisites
- Local environment setup with `firebase-tools`.
- `npm install` run in the project root.

## Verification Methods

### Method 1: Local Emulation with Code Modification (Recommended)
This is the safest and fastest way to verify retries without deploying or touching production credentials.

1.  **Modify `ai_service.ts` temporarily**:
    Add a counter to simulate failures for the first few attempts.

    ```typescript
    // src/features/daily_brands/services/ai_service.ts

    let debugAttemptCounter = 0; // Global (module-level) var for testing

    export class ValidatedAIService implements AIService {
      // ...
      private async generateAndParse(prompt: string): Promise<Product[]> {
         return retry(async () => {
             debugAttemptCounter++;
             logger.info(`[DEBUG] Attempt ${debugAttemptCounter}`);
             
             // Simulate failure for first 2 attempts
             if (debugAttemptCounter <= 2) {
                 throw new Error("Simulated Transient Error");
             }
             
             // ... existing generation logic ...
         }, { /* options */ });
      }
    }
    ```

2.  **Run the Function locally**:
    You can use the shell or a trigger script.
    ```bash
    npm run shell
    # In the shell:
    # > dailyBrandsTrigger()
    ```
    *Note: Ensure you have your `.env.local` or environment variables set up if the function needs them.*

3.  **Observe Logs**:
    Watch the terminal output. You should see:
    -   `[DEBUG] Attempt 1`
    -   `Retry attempt 1 failed... retrying in X ms`
    -   `[DEBUG] Attempt 2`
    -   `Retry attempt 2 failed... retrying in X ms`
    -   `[DEBUG] Attempt 3`
    -   `Daily Brands Refresh Completed Successfully.`

4.  **Revert Changes**:
    **CRITICAL**: Remove the `debugAttemptCounter` and simulation code before committing!

### Method 2: Unit/Integration Tests (Automated)
Manual verification is good for a sanity check, but the automated tests in `src/tests/features/daily_brands/usecase.test.ts` are the source of truth.
Run them with:
```bash
npm test src/tests/features/daily_brands/usecase.test.ts
```

## What to Look For
- **Log Messages**: Ensure the logs clearly indicate a retry is happening (e.g., "Retrying... attempt 2/3").
- **Delay**: Notice the pause between retries (should increase if exponential backoff is used).
- **Final Success**: The function should ultimately succeed once the "transient" error passes.
