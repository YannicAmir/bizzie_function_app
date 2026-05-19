# Dead-Letter Topic Setup — `weekly-recap`

## Why this matters

Pub/Sub retries a failed message up to 5 times before giving up. Without a dead-letter topic, the message is **silently dropped** after those 5 attempts. You would never know a ticker failed permanently, you could not inspect what the message contained, and you could not re-process it later.

A dead-letter topic catches those exhausted messages in a separate topic (`weekly-recap-dead-letter`). You can inspect them, alert on them, and republish them once the root cause is fixed — no data is lost.

**This must be configured separately in each GCP project (dev, qa, prod).**

---

## Step-by-step setup

### Step 1 — Create the dead-letter topic

1. Open [GCP Console](https://console.cloud.google.com) and select the correct project (dev / qa / prod).
2. Navigate to **Pub/Sub → Topics**.
3. Click **Create Topic**.
4. Topic ID: `weekly-recap-dead-letter`
5. Check **Add a default subscription** — this creates a pull subscription automatically so you can inspect dead-lettered messages in the console without a separate step.
6. Leave **Use a schema** unchecked. The DLT must accept any message unconditionally — enforcing a schema here would cause malformed messages to be rejected and lost, defeating the purpose.
7. Leave all other fields as default. Click **Create**.

---

### Step 2 — Grant the Pub/Sub service account publish permission

Pub/Sub moves failed messages on your behalf using its own service account. That service account needs permission to write to the dead-letter topic — otherwise the move silently fails.

1. In the GCP Console, find your **project number** (visible on the Project Overview page, labelled "Project number" — it is a plain integer, not the project ID string).
2. Still on **Pub/Sub → Topics**, click `weekly-recap-dead-letter`.
3. Click the **Permissions** tab → **Add Principal**.
4. In the **New principal** field enter:
   ```
   service-{PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com
   ```
   Replace `{PROJECT_NUMBER}` with the integer from step 1.
5. In the **Select a role** search box type `publisher` (not `pub`) — this surfaces **Pub/Sub Publisher**. The "Pub/Sub Lite Service Agent" that appears when searching `pub` is unrelated — do not select it.
6. Click **Save**.

---

### Step 3 — Enable dead lettering on the `weeklyRecapProcessor` subscription

> **Do this after the first deployment of `weeklyRecapProcessor`.** Firebase automatically creates a push subscription for a Pub/Sub-triggered function when it is first deployed — that subscription does not exist until the function has been deployed at least once.

Once deployed:

1. Navigate to **Pub/Sub → Subscriptions**.
2. Find the subscription attached to the `weekly-recap` topic with delivery type **Push**. It will have an auto-generated name starting with `eventarc-us-central1-weeklyRecapProcessor-` (following the same naming pattern as your other existing Push subscriptions).
3. Click the subscription name → **Edit**.
4. Scroll to the **Dead lettering** section and toggle it on.
5. **Dead letter topic**: select `weekly-recap-dead-letter`.
6. **Max delivery attempts**: set to `5` (matches the retry count in the spec).
7. Click **Update**.

---

### Step 4 — Repeat for each environment

Perform steps 1–3 in the dev, qa, and prod GCP projects independently. The topic and subscription names are identical across environments — the GCP project boundary provides isolation.
