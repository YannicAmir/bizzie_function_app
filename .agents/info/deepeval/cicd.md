# DeepEval CI/CD Integration: The "Fail-Fast" Guardian

In professional AI development, you don't manually check every prompt change. You use **CI/CD (Continuous Integration/Continuous Deployment)** to automatically "fail the build" if quality drops.

## 1. The GitHub Actions Workflow
The industry standard is to run your DeepEval tests on every **Pull Request (PR)**.

### Example Workflow (`.github/workflows/deepeval.yml`)
```yaml
name: LLM Evaluation

on:
  pull_request:
    branches: [ main ]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Install Dependencies
        run: |
          pip install deepeval
          pip install -r requirements.txt

      - name: Run DeepEval Tests
        env:
          CONFIDENT_API_KEY: ${{ secrets.CONFIDENT_API_KEY }}
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}  # For your Judge
          APP_ENV: dev
        run: |
          deepeval test run src/features/bizzie_chat/agent/tests/test_smoke.py
```

---

## 2. Setting Your "Quality Gate"
In your test files, you define the minimum quality score using the `threshold` parameter.

```python
# In your test_smoke.py
metric = AnswerRelevancyMetric(threshold=0.7)
assert_test(test_case, [metric])
```

- **If the score is 0.8**: The test **Passes** -> PR can be merged.
- **If the score is 0.6**: The test **Fails** -> The GitHub Actions build turns red, and **Merging is blocked**.

---

## 3. Best Practices for Professional CI/CD

### A. Failing on Performance Drops
Instead of a fixed threshold (e.g., 0.7), use **Regression Testing**. Confident AI can compare the current PR's score against the "Main" branch. If quality drops by more than 5%, it fails.

### B. Parallel Execution
Large datasets can take a long time to evaluate. Use the `-n` flag in your CI command to run tests in parallel:
```bash
deepeval test run tests/ -n 4
```

### C. Staging vs. Production Evals
- **CI/CD**: Fast, small "Smoke Sets" to catch obvious regressions.
- **Nightly Builds**: Large "Gold Datasets" with hundreds of cases (running for 30+ minutes).
- **Production**: sampling real user traffic and running evaluations every hour.

---

## 4. Troubleshooting CI Failures
When a build fails, do not just change the threshold!
1. **Check the Dashboard**: GitHub will provide a link to the Confident AI run.
2. **Review the Reasoning**: See the judge's exact reasoning for deducting points.
3. **Analyze the Delta**: Did you change your prompt? Did the retrieval context change?
4. **Iterate**: Fix the prompt/context, push your code, and watch the build turn green.
