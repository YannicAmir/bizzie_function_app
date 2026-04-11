# Beginner's Guide: Configuring Secrets and Permissions

This guide provides step-by-step instructions for setting up the `REVENUECAT_SECRET_TOKEN` (Secret API Key) for the Bizzie Backend.

---

## 1. Get your Secret Key from RevenueCat
1.  Log in to your [RevenueCat Dashboard](https://app.revenuecat.com/).
2.  Go to **Project Settings** > **API Keys**.
3.  Look for the **Secret API Keys** section (NOT the Public keys).
4.  Copy the key that starts with `sk_`. 
    > [!IMPORTANT]
    > If you don't have one, click **+ New** to create a "Secret Key". Name it "RC API Key".

---

## 2. Add to Google Cloud Secret Manager (For each project)
You need to repeat these steps for **each** of your 3 projects (Dev, QA, and Prod) in the Google Cloud Console:

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select the **Project** (e.g., `bizzie-dev`) from the top dropdown.
3.  Search for **Secret Manager** and click it.
4.  Click **+ CREATE SECRET** at the top.
5.  **Name**: `REVENUECAT_SECRET_TOKEN` (Must be exact).
6.  **Secret Value**: Paste the `sk_...` key for **that specific environment**.
7.  Click **CREATE SECRET**.
8.  **Repeat** for `bizzie-qa` and `bizzie-prod` using their respective keys.

---

## 3. GitHub Repository Secrets (Note)
Since your deployment pipeline is already set up to "Project Switch" automatically, you **do not** need to add the `REVENUECAT_SECRET_TOKEN` to GitHub Secrets. 

The backend code will automatically look inside the current Google Cloud Project's Secret Manager for the key during deployment and runtime.

---

## 4. Verify Service Account Permissions (Proactive)
Since you are using **GitHub Actions**, you want to ensure the Cloud Function has permission to read the secret *before* the first deployment happens. You must do this for **each** project (`dev`, `qa`, `prod`).

1.  In Google Cloud Console, select your project (e.g., `bizzie-dev`).
2.  Go to **IAM & Admin** > **IAM**.
3.  **Find the Service Account**:
    *   Look for an account in the list that ends with `@appspot.gserviceaccount.com`. This is the "App Engine default service account" that usually runs your functions.
    *   *If you don't see it*, look for `compute@developer.gserviceaccount.com`.
4.  **Add the Role**:
    *   Click the **pencil icon** (Edit) on the far right of that service account's row.
    *   Click **+ ADD ANOTHER ROLE**.
    *   Search for **Secret Manager** and select **Secret Manager Secret Accessor**.
    *   Click **SAVE**.
5.  **Repeat these steps** for your other projects (`qa` and `prod`) so their respective service accounts can also access their own local secrets.

---

## Why are we doing this?
*   **Security**: We never "hardcode" sensitive keys in the code.
*   **Access**: Even though the key exists in Secret Manager, Google Cloud is "Secure by Default." This IAM permission is the "Gate Key" that allows your running code to actually unlock and read that value.
*   **Deployment**: Because we added `secrets: [revenueCatSecret]` in our code, the deployment will fail if this permission isn't set up!
