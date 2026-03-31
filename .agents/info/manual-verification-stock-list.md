# Manual Verification: Stock List Sync

## Prerequisites
- Functional Firebase Emulator or deployed Dev environment.
- FMP API Key configured in `src/core/config.ts` (mapped to `FMP_API_KEY`).

## Hybrid Verification (Local Code -> Remote Dev DB)
**Use this mode to test your local logic against the REAL database without deploying.**

1.  **Configure Environment Variables**
    Create a file named `.env` in the project root (if not exists) and add your FMP API Key:
    ```env
    FMP_API_KEY=your_fmp_api_key_here
    ```
    *Note: The shell needs this to make authorized calls to FMP.*

2.  **Stop Remote Emulators**
    Ensure no emulators are running (Press `Ctrl+C` if running `npm run serve`).

2.  **Target Dev Project**
    Tell the CLI to use your real project credentials:
    ```bash
    firebase use bizzie-dev
    # Or your specific project ID if different
    ```

3.  **Run the Shell**
    ```bash
    npm run shell
    ```

4.  **Trigger**
    Inside the shell:
    ```javascript
    stockListSync()
    ```
    *Result:* The function runs locally on your laptop, but reads/writes to the **real** Firestore in Google Cloud. You can verify the data appears in the Cloud Console.
