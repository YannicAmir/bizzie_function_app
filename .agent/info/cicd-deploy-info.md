---
description: Manual setup steps for CICD Deploy agent
---
# CICD Deploy Manual Setup

## 1. Create Google Cloud Service Accounts
For **EACH** environment (Dev, QA, Prod), perform the following:
1.  Go to the Google Cloud Console for the project (e.g., `bizzie-dev`).
2.  Navigate to **IAM & Admin** > **Service Accounts**.
3.  Click **Create Service Account**.
4.  Name it (e.g., `github-action-deployer`) and click **Create and Continue**.
5.  Grant the following roles:
    - **Cloud Functions Admin** (Developer/Admin access to functions)
    - **Artifact Registry Writer** (Required for 2nd Gen functions to push images)
    - **Service Account User** (ActInAs permission)
    - **Firebase Admin** (General Firebase API access)
6.  Click **Done**.

## 2. Generate and Download Permissions Keys
For **EACH** service account created above:
1.  Click on the newly created service account (email address).
2.  Go to the **Keys** tab.
3.  Click **Add Key** > **Create new key**.
4.  Select **JSON** and click **Create**.
5.  A `.json` file will download. **Keep this safe and do not commit it.**

## 3. Configure GitHub Secrets
1.  Go to your GitHub Repository.
2.  Navigate to **Settings** > **Secrets and variables** > **Actions**.
3.  Click **New repository secret**.
4.  Add the secrets corresponding to your environments. Paste the **entire content** of the JSON key file into the value field.

    | Secret Name | JSON Key File |
    | :--- | :--- |
    | `FIREBASE_SERVICE_ACCOUNT_DEV` | `bizzie-dev-....json` |
    | `FIREBASE_SERVICE_ACCOUNT_QA` | `bizzie-qa-....json` |
    | `FIREBASE_SERVICE_ACCOUNT_PROD` | `bizzie-prod-....json` |

## 4. Verification
Once the secrets are added, you can run the `cicd-deploy` workflow (via the agent) to generate the CI file, and then push code to `dev`, `qa`, or `main` to test the deployment.
