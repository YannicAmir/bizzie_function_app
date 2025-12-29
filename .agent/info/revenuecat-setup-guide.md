# RevenueCat Setup Guide (Manual Steps)

This guide will help you set up RevenueCat to work with your "Secure Backend" architecture. RevenueCat includes Webhooks on their free tier (up to $2.5k MTR), making it perfect for us.

## 1. Create RevenueCat Account
1.  Go to [RevenueCat.com](https://www.revenuecat.com/) and Sign Up.
2.  Create a new Project (e.g., "Bizzie").

## 2. Configure Your App
1.  In the Dashboard, go to **Apps** (on the left sidebar).
2.  Click **+ App** and select **App Store** (iOS).
    *   **App Bundle ID**: `com.yourname.bizzie` (Must match your actual iOS Bundle ID).
    *   **Shared Secret**: You can skip this for now if you haven't set up App Store Connect yet, but you'll need it before you launch.

## 3. Configure the Webhook (The Critical Part)
We need to tell RevenueCat to "Ping" our backend whenever a purchase happens.

1.  In the Project Dashboard, look for **Integrations** on the left sidebar.
2.  Find **Webhooks** in the list and click it.
3.  Click **+ New Configuration**.
4.  **Destination URL**:
    *   *Leave blank for now*. I will give you this URL after I deploy (e.g., `https://us-central1-bizzie.cloudfunctions.net/revenueCatWebhook`).
5.  **Authorization Header**:
    *   Click "Add header".
    *   Key: `Authorization`
    *   Value: Create a password (e.g., `bizzie_secret_999`).
    *   **SAVE THIS PASSWORD**. We need to put this in your backend secrets so we know it's really RevenueCat calling us.
6.  **Events**: Ensure verified events like "Initial Purchase", "Renewal", "Cancellation", and "Uncancellation" are checked.

## 4. (Optional) Create Entitlements
RevenueCat uses "Entitlements" to group products (e.g. "Pro Access").
1.  Go to **Entitlements**.
2.  Create one called `premium`.
    *   This ID (`premium`) is what we will often check against in the future.

## 5. Configure Secrets (Google Cloud)
We need to store the `Authorization` header value securely in Google Cloud Secret Manager so our backend can access it.

### Option A: Using Google Cloud Console (UI)
1.  Go to **Secret Manager** in Google Cloud Console (the page in your screenshot).
2.  Click **+ Create Secret** (top of the list).
3.  **Name**: `REVENUECAT_SECRET_TOKEN` (Must be exact).
4.  **Secret Value**: Paste your password (e.g., `bizzie_secret_010324`).
5.  **Replication Policy**: Leave as "Automatic".
6.  Click **Create Secret**.

### Option B: Using Terminal (CLI)
You can also run this command in your VS Code terminal:
```bash
firebase functions:secrets:set REVENUECAT_SECRET_TOKEN
```
It will ask you to enter the value. Paste your secret and press Enter.

## 6. Next Steps
I will now build the backend handler which will read this secret securely.
Once deployed, I will give you the **Destination URL** to paste into RevenueCat.

## 7. Configuration for Multiple Environments (Dev, QA, Prod)
Since you have 3 Firebase projects but RevenueCat only has "Sandbox" vs "Production" events, here is the Best Practice setup:

**You will create TWO Webhooks in RevenueCat:**

### Webhook A: The Dev/Sandbox Handler
*   **Name**: `Bizzie DEV (Sandbox)`
*   **URL**: `https://us-central1-bizzie-dev-7199b.cloudfunctions.net/revenueCatWebhook`
*   **Auth Header**: [REVENUECAT_SECRET_TOKEN]
*   **Environment to send events for**: Select **Sandbox Only**.
*   **Why**: This ensures your Dev environment gets all the test data/TestFlight events.

### Webhook B: The Production Handler
*   **Name**: `Bizzie PROD (Live)`
*   **URL**: `https://us-central1-bizzie-prod.cloudfunctions.net/revenueCatWebhook`
*   **Auth Header**: [REVENUECAT_SECRET_TOKEN]
*   **Environment to send events for**: Select **Production Only**.
*   **Why**: This ensures your Real User database is clean and only contains real money transactions.

*(Note: QA usually shares the Sandbox stream or is tested manually. If you strictly need QA to receive events, you can create a 3rd webhook pointing to QA URL with Sandbox events, but be aware you will get duplicate events in Dev and QA).*
