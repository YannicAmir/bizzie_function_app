---
description: Rules and best practices for the CICD Deploy agent
---
# CICD Deploy Rules

## Constraints
- **Authentication**: You MUST use `google-github-actions/auth@v2` (Workload Identity Federation or Service Account Keys) for reliable 2nd Gen Cloud Function deployments.
- **Environment Isolation**: Deployments MUST be strictly isolated.
    - `dev` branch -> `dev` project
    - `qa` branch -> `qa` project
    - `main` branch -> `prod` project
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
