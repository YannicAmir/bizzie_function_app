# RevenueCat Testing Guide (Beginner Friendly)

This guide will take you step-by-step through testing your new secure subscription system.

## Phase 1: Deploy & Configure (Required)

Before we can test, the code must be live on Google Cloud.

## Phase 1: Deploy & Configure (Required)

Since you use GitHub Actions, triggering a deployment is easy:

### 1. Push Your Code
Commit and push your changes to your `dev` branch (or whichever branch triggers your Dev deployment).
```bash
git add .
git commit -m "feat: add revenuecat webhook"
git push
```
*   **Wait**: Go to your GitHub Actions tab and watch the build. It usually takes 3-5 minutes.
*   **Success**: Ensure the "Deploy" step passes (Green Checkmark).

### 2. Find Your Webhook URL
Once GitHub Actions finishes, you need the URL.
*   **Option A**: Check the logs in the GitHub Action "Deploy" step.
*   **Option B (Easier)**: Go to the **Google Cloud Console** -> **Cloud Functions**.
    *   Find `revenueCatWebhook`.
    *   Click it and look for the **Trigger** tab. Copy the URL.

### 3. Update RevenueCat Dashboard
1.  Go to **RevenueCat Dashboard** -> **Integrations** -> **Webhooks**.
2.  Click on the webhook you created (e.g., "Bizzie DEV").
3.  **Webhook URL**: Paste the URL you just copied.
4.  **Save**.

---

## Phase 2: "Safe" Verification (Simulated Test)

We will "pretend" to be RevenueCat by sending a fake event to your backend. This verifies the code works without spending money or needing a phone.

### 1. The Test Command
Run this command in your terminal. It sends a fake "Create Subscription" event.

**Important**: Replace `YOUR_URL_HERE` with the URL you found in Phase 1.

```bash
curl -X POST YOUR_URL_HERE \
  -H "Authorization: bizzie_secret_010324" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "type": "INITIAL_PURCHASE",
      "app_user_id": "test_user_999",
      "expiration_at_ms": 1998790400000
    },
    "api_version": "1.0"
  }'
```

### 2. Verify Result in Firestore
1.  Go to the **Firebase Console** -> **Firestore Database**.
2.  Look for the `users` collection.
3.  Find the document named `test_user_999`.
4.  **Success Criteria**:
    *   Do you see `isSubscribed: true`?
    *   Do you see `updatedAt`?
    
If yes, your backend is perfect!

---

## Phase 3: "Live" Verification (Real Device)

This tests the entire chain: Apple -> RevenueCat -> Bizzie Backend -> Firestore.

### 1. Prepare App
*   Run your Flutter app on a real iOS device or Simulator.
*   Make sure you are logged in (so a `users/{userId}` document exists).

### 2. Make a Purchase
*   Click "Subscribe" in your app.
*   Complete the purchase (using the sandbox "Confirm" dialog).

### 3. Watch the Magic
1.  Wait about 5-10 seconds.
2.  Check YOUR user document in Firestore.
    *   **Success**: `isSubscribed` should flip to `true` automatically!
