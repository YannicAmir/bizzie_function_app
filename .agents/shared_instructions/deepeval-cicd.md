---
name: DeepEval CI/CD Integration
description: Shared standards for wiring DeepEval into GitHub Actions.
---

# DeepEval CI/CD Integration

To maintain PLATINUM-grade quality, follow these patterns for GitHub Actions.

## 1. Environment Secrets
REQUIRED: Store the following in GitHub Repo Secrets:
- `CONFIDENT_API_KEY`: The API key for your Confident AI project.
- `GOOGLE_APPLICATION_CREDENTIALS`: JSON key for a service account with Vertex AI access (for the Judge Model).

## 2. GitHub Action Blueprint
Add a dedicated `eval.yml` or update `deploy.yml`:

```yaml
jobs:
  deepeval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -r src/features/[feature_name]/agent/requirements-dev.txt
          pip install deepeval
      
      - name: Run Evals
        env:
          CONFIDENT_API_KEY: ${{ secrets.CONFIDENT_API_KEY }}
          APP_ENV: qa
        run: |
          # Use -n for parallelization to save time/cost
          # Use -id for dashbard tracking
          deepeval test run src/features/[feature_name]/agent/tests/ -n 4 -id "PR-${{ github.event.number }}"
```

## 3. Failure Strategy
- **Soft Fail (Warning)**: During the first 2 weeks of a new feature, set the step to `continue-on-error: true`. This allows you to calibrate thresholds without blocking developers.
- **Hard Fail (Blocking)**: Once thresholds are calibrated (e.g., 0.8 consistently), remove `continue-on-error`. The PR **must pass** evaluation to be merged.

## 4. Regression Analysis
Always compare the PR score against the `main` branch score in the Confident AI dashboard before approving a PR.
