# CICD Deploy Rules

## Constraints
- **Authentication**: You MUST use `google-github-actions/auth@v2` (Workload Identity Federation or Service Account Keys) for reliable 2nd Gen Cloud Function deployments.
- **Environment Isolation**: Deployments MUST be strictly isolated.
    - `dev` branch → `dev` project
    - `qa` branch → `qa` project
    - `main` branch → `prod` project
- **Test Gating**: All deployments MUST run `npm test` before `npm run build` or `firebase deploy`. If tests fail, the deployment must stop.
- **Node Version**: The CI environment MUST match the runtime environment (Node 20).
- **Dependency Management**: Use `npm ci` (Clean Install) instead of `npm install` in CI/CD to ensure consistent dependency versions from `package-lock.json`.
- **Firebase CLI**: Always install the latest version of `firebase-tools` in the runner.

## Naming Conventions
- **Secrets**: Use uppercase with environment suffixes for GitHub Secrets:
    - `FIREBASE_SERVICE_ACCOUNT_DEV`
    - `FIREBASE_SERVICE_ACCOUNT_QA`
    - `FIREBASE_SERVICE_ACCOUNT_PROD`
- **Workflow File**: The main file should be named `.github/workflows/deploy-functions.yml`.

---

## Workflow

### Step 1: Verify Directory
Ensure `.github/workflows` exists. If not, create it.

### Step 2: Generate Workflow File
Create or overwrite `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Functions

on:
  push:
    branches:
      - dev
      - qa
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Tests
        run: npm test

      - name: Build Project
        run: npm run build

      # --- CONFIGURE ENVIRONMENT ---
      - name: Set Environment Variables (Dev)
        if: github.ref == 'refs/heads/dev'
        run: |
          echo "FIREBASE_ALIAS=dev" >> $GITHUB_ENV
          echo "GCP_SA_KEY=${{ secrets.FIREBASE_SERVICE_ACCOUNT_DEV }}" >> $GITHUB_ENV

      - name: Set Environment Variables (QA)
        if: github.ref == 'refs/heads/qa'
        run: |
          echo "FIREBASE_ALIAS=qa" >> $GITHUB_ENV
          echo "GCP_SA_KEY=${{ secrets.FIREBASE_SERVICE_ACCOUNT_QA }}" >> $GITHUB_ENV

      - name: Set Environment Variables (Prod)
        if: github.ref == 'refs/heads/main'
        run: |
          echo "FIREBASE_ALIAS=prod" >> $GITHUB_ENV
          echo "GCP_SA_KEY=${{ secrets.FIREBASE_SERVICE_ACCOUNT_PROD }}" >> $GITHUB_ENV

      # --- AUTHENTICATE & DEPLOY ---
      - name: Authenticate with Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ env.GCP_SA_KEY }}

      - name: Setup Google Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Install Firebase CLI
        run: npm install -g firebase-tools

      - name: Deploy to Firebase
        run: firebase deploy --only functions --project ${{ env.FIREBASE_ALIAS }} --force
```

### Step 3: Finalize
- Notify the user the pipeline file has been created.
- Remind them to complete the manual setup steps in `.agent/info/cicd-deploy-info.md` if they haven't already.
