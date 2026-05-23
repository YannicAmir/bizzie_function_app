---
name: CICD Deploy Instructions
description: Rules, constraints, workflow, and checklist for creating and managing the GitHub Actions deploy-functions.yml pipeline.
---

# Instructions for CicdDeploy

## Constraints

1. Authentication MUST use `google-github-actions/auth@v2` (Workload Identity Federation or Service Account Keys) for reliable 2nd Gen Cloud Function deployments.
2. Deployments MUST be strictly environment-isolated:
   - `dev` branch deploys to the `dev` GCP project
   - `qa` branch deploys to the `qa` GCP project
   - `main` branch deploys to the `prod` GCP project
3. All deployments MUST run `npm test` before `npm run build` or `firebase deploy`. If tests fail the deployment must stop.
4. The CI environment MUST use Node 20 to match the runtime environment.
5. Use `npm ci` (Clean Install) instead of `npm install` in CI/CD to ensure consistent dependency versions from `package-lock.json`.
6. Always install the latest version of `firebase-tools` in the runner.
7. Use uppercase with environment suffixes for GitHub Secrets:
   - `FIREBASE_SERVICE_ACCOUNT_DEV`
   - `FIREBASE_SERVICE_ACCOUNT_QA`
   - `FIREBASE_SERVICE_ACCOUNT_PROD`
8. The workflow file MUST be named `.github/workflows/deploy-functions.yml`.
9. See project CLAUDE.md for architecture and tech stack reference.

## Workflow

### Step 1: Verify Directory
Ensure `.github/workflows` exists. If not, create it.

### Step 2: Generate Workflow File
Create or overwrite `.github/workflows/deploy-functions.yml` with the following content:

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
- Remind them to add the three GitHub Secrets (`FIREBASE_SERVICE_ACCOUNT_DEV`, `FIREBASE_SERVICE_ACCOUNT_QA`, `FIREBASE_SERVICE_ACCOUNT_PROD`) in their GitHub repository settings if they haven't already.

---

## Checklist
- [ ] `.github/workflows/` directory exists
- [ ] `deploy-functions.yml` created or overwritten
- [ ] `npm test` step runs before `npm run build`
- [ ] Three environment branches (dev, qa, main) correctly mapped to aliases
- [ ] `google-github-actions/auth@v2` used for authentication
- [ ] `npm ci` used (not `npm install`)
- [ ] Node version set to 20
- [ ] User reminded to configure GitHub Secrets
