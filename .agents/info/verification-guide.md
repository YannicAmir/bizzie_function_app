# Subscription Cleanup Verification Guide

This guide explains how to verify the **Subscription Cleanup** feature locally before deploying to production.

## 1. Setup Environment Variables
To run the verification script, your local environment needs access to the RevenueCat API and your Firestore database.

### A. Create a `.env` file
Add the following to your `.env` file in the project root:

```text
# RevenueCat Secret API Key (sk_...)
RC_API_KEY=sk_your_actual_key_here

# The Project ID for Dev
GCLOUD_PROJECT=bizzie-dev-7199b
```

### B. Get your RevenueCat API Key
1. Log into the **RevenueCat Dashboard**.
2. Go to **Project Settings** -> **API Keys**.
3. Copy the **Secret Key** (it starts with `sk_`). **Do not use the Public Key.**

---

## 2. Setup Firebase Service Account
Your script needs permission to talk to Firestore.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project: `bizzie-dev-7199b`.
3. Go to **IAM & Admin** -> **Service Accounts**.
4. Find the account named `firebase-adminsdk` (or similar).
5. Click **Actions** (three dots) -> **Manage keys**.
6. Click **ADD KEY** -> **Create new key** -> **JSON**.
7. Save the downloaded file to a safe location (e.g., `~/keys/bizzie-dev-key.json`).
8. Add the path to this file to your terminal session or `.env`:
   ```text
   GOOGLE_APPLICATION_CREDENTIALS=/Users/yourname/keys/bizzie-dev-key.json
   ```

---

### B. The "Better/Safer" Way (Recommended)
The standard industry practice for local development is to store keys in a "hidden" directory in your **User Home** folder. This way, the key is physically impossible to commit to your repository.

1.  **Create a global folder**:
    ```bash
    mkdir -p ~/.gcp_keys
    ```
2.  **Move the key there**:
    ```bash
    # Replace the filename with your actual downloaded file
    mv ~/Downloads/bizzie-dev-7199b-*.json ~/.gcp_keys/bizzie-dev.json
    ```
3.  **Update your `.env`**:
    Add the absolute path to your home directory (replace `yannicamir` with your username if it differs):
    ```text
    GOOGLE_APPLICATION_CREDENTIALS=/Users/yannicamir/.gcp_keys/bizzie-dev.json
    ```

---

## 3. Run the Verification Script

Once your `.env` and Service Account are set up, run the following command:

```bash
# From the project root
npx ts-node src/scripts/test_cleanup.ts
```

### What to expect:
1. The script will query Firestore for "ghost" users (Subscribed in DB, but Expired date).
2. It will call the RevenueCat API to verify their true status.
3. If confirmed expired, it will update Firestore and log the results in a table.

---

## 4. Manual Verification (Safety Check)
To manually test a specific scenario:
1. Open **Firebase Console** -> Firestore.
2. Find a test user and set `isSubscribed: true`.
3. Set `subscriptionExpiryDate` to a date in the past (e.g., `2024-01-01`).
4. Run the script.
5. Refresh the user in Firestore—it should now be `isSubscribed: false`.
