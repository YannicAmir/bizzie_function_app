# FMP API Troubleshooting Guide

If you are seeing **"FMP API Error: 401 Unauthorized"** in your logs, it means the Financial Modeling Prep (FMP) API is rejecting your request because the API key is not being recognized. 

Follow these step-by-step instructions to fix the configuration of your Secret and IAM permissions.

## 1. Fix the `FMP_API_KEY` Secret
A `401` error often happens because the API key is stored incorrectly (e.g., wrapped in JSON or containing invisible characters).

1.  **Open Google Cloud Console**: Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager).
2.  **Find the Secret**: Look for the secret named `FMP_API_KEY`.
3.  **Create a New Version**:
    *   Click on the secret name.
    *   Click the **+ New version** button at the top (it looks like a blue plus sign).
4.  **Enter the Raw Key**:
    *   In the "Secret value" box, **delete everything**.
    *   Paste your FMP API key.
    *   **CRITICAL**: Do NOT include any braces `{}`, quotes `"`, or keys like `1:`. It must be just the raw string.
5.  **Save**: Click **Add New Version**.
6.  **Update Cloud Functions**:
    *   **The Good News**: Most deployments are set to use the `latest` version automatically. If yours is, it will pick up the new key on the next cold start.
    *   **How to Verify**:
        1. Go to the [Cloud Functions](https://console.cloud.google.com/functions/list) page.
        2. Click the **Revisions** tab.
        3. Click on the **active revision** (it has a green checkmark next to it, like `realtime8knotifier-00029`).
        4. In the side-panel that opens on the right, look at the **Container** tab.
        5. Scroll down to the **Variables** or **Secrets** section.
        6. Find `FMP_API_KEY`.
        7. **Look at the end of the line**: If you see **`:1`** (like in your screenshot), it means you are trapped on the old version!

## 2. Grant IAM Permissions (Secret Accessor)
The service account running your code must have permission to "read" that secret. Based on your view, you are already in the right place!

1.  **Open the Permissions Tab**: While inside the `FMP_API_KEY` secret, click the **Permissions** tab at the top.
2.  **Verify or Add Access**:
    *   Look for `5470748320-compute@developer.gserviceaccount.com` in the list.
    *   If it is there, ensure it has the role **Secret Manager Secret Accessor**.
    *   **If it's NOT there**: Click the **+ Grant Access** button, paste the service account email, and select the **Secret Manager Secret Accessor** role.
3.  **Check Inheritance**: Roles listed with a blue link (like "Bizzie Dev") are inherited from the project level, which is also fine.

## 3. Correcting Typos & Cleaning Up
If you realize you made a typo (like in your screenshot where there is an extra `y` at the end), here is the best practice:

1.  **Don't Edit, Add New**: You cannot "edit" a version once it is saved. Always click **+ New version** and paste the **correct** key.
2.  **Verify New Version**: Ensure the new version (e.g., Version 3) is the one without the typo.
3.  **Is it Safe to Destroy?**: 
    *   **Yes**, but with a catch: If your Cloud Function is "pinned" to a specific version number (like `1`), destroying it will cause the function to fail immediately.
    *   **Best Practice**: 
        *   First, add the **correct** version.
        *   Then, **Disable** the broken version for 24 hours. (This "turns it off" without deleting the data. If nothing breaks, you know it's safe).
        *   Finally, click **Destroy** on the broken versions to keep your Secret Manager clean.

> [!TIP]
> Always keep your secret as a single line. In your screenshot, there was a `y` on a new line. When you paste the new version, make sure there are no trailing spaces or new lines!
