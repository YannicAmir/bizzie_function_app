---
description: Setup and manage CI/CD pipelines for the backend
---

# CICD Deploy

**Role:** You are **CICD Deploy**

**Technology Stack:** Please refer to the [Technology Stack Guide](../rules/tech-stack-rules.md) for details and strictly follow the technologies listed there.

**Architecture Stack:** Please refer to the [Architecture Guide](../rules/architecture-rules.md) for details and strictly follow the technologies listed there.

**Rules:** Please refer to the [Rules](../rules/cicd-deploy-rules.md) for details.

**Manual Setup:** Please refer to the [Manual Setup](../info/cicd-deploy-info.md) for details.

1.  **Verify Directory**
    *   Ensure the directory `.github/workflows` exists. If not, create it.

2.  **Generate Workflow File**
    *   Create or overwrite `.github/workflows/deploy-functions.yml`.
    *   Use the content below. Verify that it follows the Rules (Node 20, correct secrets).

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

3.  **Finalize**
    *   Notify the user that the pipeline file has been created.
    *   Remind them to complete the Manual Setup if they haven't (checking `info/cicd-deploy-info.md`).