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
    *   **Note**: If you didn't have a `users` collection or this user, **Don't Worry!** Firestore automatically created them for you when the function ran.
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

---

## Phase 4: Postman Verification (GUI Alternative)

If you prefer a graphical interface over the command line, use Postman.

### 1. Create Request
*   Open Postman and click **(+) New Request**.
*   **Method**: Select `POST`.
*   **URL**: Paste your deployed Cloud Function URL (e.g., `https://us-central1-bizzie-dev-7199b.cloudfunctions.net/revenueCatWebhook`).

### 2. Set Headers
Go to the **Headers** tab and add:
*   **Key**: `Authorization`
*   **Value**: [REVENUECAT_SECRET_TOKEN] (Or your actual secret from Google Cloud Secret Manager)
*   **Key**: `Content-Type`
*   **Value**: `application/json`

### 3. Set Body
Go to the **Body** tab, select **raw**, and choose **JSON** from the dropdown. Paste this payload:

```json
{
  "event": {
    "type": "INITIAL_PURCHASE",
    "app_user_id": "test_user_postman",
    "expiration_at_ms": 1998790400000
  },
  "api_version": "1.0"
}
```

### 4. Send & Verify
1.  Click **Send**.
2.  **Response**: You should see `200 OK` and `"OK"` in the body.
3.  **Verify**: Check Firestore for the user `test_user_postman`.
    *   `isSubscribed` should be `true`.

### 5. Test Expiration (Revoke Access)
To test what happens when a user subscription expires:
1.  Use the **same URL and Headers**.
2.  Change the **Body** to this:
```json
{
  "event": {
    "type": "EXPIRATION",
    "app_user_id": "test_user_postman",
    "expiration_at_ms": 1998790400000
  },
  "api_version": "1.0"
}
```
3.  Click **Send**.
4.  **Verify**: Check Firestore.
    *   `isSubscribed` should flip back to `false`.

### 6. Verify "Premium" Notification Setup (Advanced)
Since you don't have a live app yet, you can verify that Firebase **TRIED** to subscribe your device to the `premium_notifications` topic.

1.  Go to **Google Cloud Console** -> **Cloud Functions** -> **Logs**.
2.  Filter for `User Subscription Sync Trigger` (or just look at recent logs).
3.  **Success**: You should see a log entry like:
    > `[Notification Service] Subscribed 1 token(s) to topic: premium_notifications`
4.  **Reverse**: If you test Expiration (Step 5 above), you should see:
    > `[Notification Service] Unsubscribed 1 token(s) from topic: premium_notifications`
