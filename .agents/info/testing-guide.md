# Local Testing & Verification Guide

Since you are building **Scheduled Functions** (which usually only run on a timer), you need a way to force them to run right now on your machine to verify they work.

There are **3 Ways** to test, ranging from "Fastest" to "Most Realistic".

## 1. Unit Tests (The "Clean Architecture" Way) - ⚡️ Fastest
Because we separated your code into `trigger.ts` vs. `usecase.ts`, you can test the **logic** without needing Google Cloud at all.

*   **What it tests**: The Use Case logic (e.g., "Does it calculate the Right Brands?").
*   **Command**: `npm test`
*   **Where**: `src/tests/`

## 2. The Functions Shell (Manual Trigger) - 🛠️ Best for Schedulers
The Firebase Functions Shell allows you to "fake" a trigger. You get a command line where you can just call your function like a JavaScript function.

**Steps:**
1.  Run `npm run shell`.
2.  Wait for the prompt `firebase >`.
3.  Call your function. If your function is named `dailyBrandsTrigger`, type:
    ```js
    dailyBrandsTrigger()
    ```
    *   *Note: If it's a scheduled function, you might not need arguments. If it's an HTTP function, you might need `dailyBrandsTrigger.get('/query')`.*

## 3. The Local Emulator (Full System) - 🌐 Most Realistic
This spins up a fake Google Cloud on your laptop. It simulates Firestore, Auth, and Functions together.

**Steps:**
1.  Run `npm run serve`.
    *   This starts the Emulator UI (usually at `http://localhost:4000`).
2.  **Triggering Schedulers**:
    *   Open the Emulator UI in your browser (`http://localhost:4000`).
    *   Go to the **Functions** tab.
    *   You will see your "Scheduled" functions listed.
    *   There is usually a **"Run Now"** button (or you can manually trigger via HTTP if testing an HTTP function).

3.  **Verifying Data**:
    *   Go to the **Firestore** tab in the same UI.
    *   Watch the data appear in realtime as your function runs!

## Summary Recommendation
1.  Write a test in `src/tests/` to prove the **logic** works.
2.  Use `npm run serve` + Emulator UI to prove the **connection** to the database works.
