---
description: Manual setup steps for CICD Deploy agent
---
# CICD Deploy Manual Setup

## 1. Enable Required Configuration
**Before creating service accounts**, ensure these APIs are enabled in your Google Cloud Project:
*   **Cloud Build API** (`cloudbuild.googleapis.com`)
*   **Artifact Registry API** (`artifactregistry.googleapis.com`)
*   **Cloud Functions API** (`cloudfunctions.googleapis.com`)
*   **Cloud Logging API** (`logging.googleapis.com`)
*   **Cloud Scheduler API** (`cloudscheduler.googleapis.com`)
*   **Cloud Run API** (`run.googleapis.com`)

## 2. Create Google Cloud Service Accounts
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

4.  **Verification**:
    Once the secrets are added, you can run the `Manual Deployment` workflow (via the GitHub Actions tab) to deploy code. Deployments are **Manual Only** and do NOT run automatically on push.

## 5. Advanced Configuration (Best Practices)

### A. Pull Request Checks (Branch Protection)
The project includes a `pr-checks.yml` workflow that runs `npm test` and `npm lint` on every Pull Request. To enforce this:
1.  Go to **GitHub Settings** > **Branches** > **ADD classic branch protection rule**.
2.  Pattern: `dev`, `qa`, or `main`.
3.  Check **Require status checks to pass before merging**.
4.  Search for and select: `validate`.
    *   *Note: If `validate` doesn't appear, push a PR first to let it run once.*

### B. Code Ownership
A `.github/CODEOWNERS` file is configured to automatically request reviews.
*   **Current Rule:** `* @YannicAmir` (Global Ownership).
*   **Effect:** You will be auto-assigned as a reviewer on PRs. Ensure "Require review from Code Owners" is checked in Branch Protection settings.

### C. Manual Deployment (Feature Branches)
You can manually deploy any branch (e.g., a feature branch) to a specific environment (e.g., `dev`) to test it before merging.
1.  Go to the **Actions** tab in GitHub.
2.  Select **Deploy Functions**.
3.  Click **Run workflow**.
4.  Select the **Branch** you want to deploy.
5.  Select **Target Environment** from the dropdown loop (e.g., `dev`).

### D. Security Note
*   **Current Auth:** Service Account Keys (JSON).
*   **Future Upgrade:** **Workload Identity Federation (WIF)**.
    *   *Why:* Eliminates long-lived JSON keys.
    *   *When:* Consider upgrading in ~6 months or when scaling the team.
