# How to Run the SEC Simulation Script
This guide explains how to use the local script `scripts/run_sec_simulation.ts` to manually test the SEC Filing pipeline without deploying any code.

## 1. Safety Check
This script connects to the **Real Development Database (bizzie-dev-7199b)**.
*   **Do not** use this with Production credentials.
*   Ensure you are logged in as a developer account.

## 2. Setup (One-Time)
Install `ts-node` as a development dependency for this project.
```bash
npm install -D ts-node
```

Authenticate with Google Cloud so the script can access Firestore and Vertex AI:
```bash
gcloud auth application-default login
```

## 3. Configure Mock Data
Open `scripts/run_sec_simulation.ts` in your editor.
*   Locate the `MOCK_DATA` array near the top of the file.
*   Edit the JSON objects to test different scenarios (different tickers, dates, link URLs).

## 4. Run the Simulation
Run this command from the root of your project (`bizzie_function_app/`):

```bash
npx ts-node src/scripts/run_sec_simulation.ts
```

## 5. What Happens Next?
1.  **Console Output:** You will see logs in your terminal as the script runs.
    *   `[MockSecService] Returning mock data...`
    *   `[Vertex AI] Analyzing...`
2.  **Firestore Updates:**
    *   Go to the Firebase Console (Dev Project).
    *   Check `sec_filings` collection: New documents should appear.
    *   Check `financial_reports` collection: Deep analysis reports should appear (after a few seconds).
3.  **Notifications:**
    *   The script attempts to send FcmNotifications using the real service. If you have a device subscribed to the `NVDA` topic in Dev, you might receive a notification.

## Troubleshooting
*   **"Permission Denied":** Run `gcloud auth application-default login` again.
*   **"Module not found":** Run `npm install` in the root directory.
