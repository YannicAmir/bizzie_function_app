---
name: CICD Deployment Steps
description: Process for configuring GitHub Actions workflows for secure and isolated deployments.
---

# CICD Deployment Steps

Follow these phases to set up or update the CI/CD pipeline for the Bizzie Function App.

---

## Phase 1: Environment & Secret Audit

1.  **Verify Aliases**: Ensure Firebase projects for `dev`, `qa`, and `prod` are available.
2.  **Audit Secrets**: Confirm the following GitHub Secrets are configured:
    -   `FIREBASE_SERVICE_ACCOUNT_DEV`
    -   `FIREBASE_SERVICE_ACCOUNT_QA`
    -   `FIREBASE_SERVICE_ACCOUNT_PROD`

---

## Phase 2: Workflow Generation

1.  **Create Directory**: Ensure `.github/workflows/` exists.
2.  **Implement Deployment Workflow**: Create `.github/workflows/deploy-functions.yml`.
3.  **Configure Pipeline Logic**:
    -   **Triggers**: Push to `dev`, `qa`, `main` or manual trigger.
    -   **Runtime**: Use Node 20.
    -   **Dependencies**: Use `npm ci`.
    -   **Gating**: Run `npm test` and `npm run build` before deployment.
    -   **Isolation**: Map branches strictly to their respective Firebase projects.
    -   **Auth**: Use `google-github-actions/auth@v2`.

---

## Phase 3: Finalization

1.  **External Documentation**: Remind the user to complete any manual setup required for Workload Identity Federation or Service Account permissions.
2.  **Test Run**: Encourage a manual trigger to verify the pipeline starts correctly.

---

## Verification Checklist

- [ ] `.github/workflows/deploy-functions.yml` is correctly placed.
- [ ] Workflow uses Node 20 and `npm ci`.
- [ ] Deployment is gated by successful tests and builds.
- [ ] Environment isolation logic (branch → project) is correct.
- [ ] Auth uses the recommended Google Cloud Actions.
- [ ] All paths are project-root-relative.
