# Evaluation

LLM output quality is evaluated via **Confident AI / DeepEval** using a dataset-based approach. Evaluation runs in the CI/CD pipeline — it is completely outside the runtime request path.

---

## Approach

Test cases and golden datasets are maintained in the Confident AI dashboard. `deepeval run` executes evaluations in CI/CD after each deployment, pulling datasets from Confident AI, scoring outputs, and reporting results back to the dashboard.

| Concern | Where it lives |
|---|---|
| Per-ticker processing | Runtime — `weeklyRecapProcessor` writes summaries to Firestore |
| LLM output quality | CI/CD — `deepeval run` against Confident AI datasets |
| Schema correctness | Runtime — `validateSchema` LangGraph node (pure TypeScript) |
| Service correctness | CI/CD — Jest unit tests (see [testing.md](testing.md)) |

---

## Dataset Management

Datasets are created and maintained in the **Confident AI dashboard** under the `weekly-recap` project (one project per environment: dev / qa / prod).

Each test case contains:

| Field | Description |
|---|---|
| `input` | Full prompt string passed to `summarizeNews` |
| `actual_output` | The `messageLongSummary` produced by the LLM |
| `context` | Source grounding: news articles, 8-K links |
| `expected_output` | (Optional) Reference summary for comparison metrics |

Datasets are versioned in Confident AI (e.g. `weekly-recap-v1`). Create a new dataset version when the prompt template changes, new source data types are added, or evaluation criteria are revised.

---

## Metrics Evaluated

| Metric | DeepEval class | What it checks |
|---|---|---|
| Answer relevancy | `AnswerRelevancyMetric` | Summary content is germane to the ticker and week window |
| Faithfulness | `FaithfulnessMetric` | Claims are grounded in the provided source documents |
| Hallucination | `HallucinationMetric` | No fabricated names, events, dates, or figures |

Thresholds and LLM-as-Judge model are configured per dataset in the Confident AI dashboard — not hardcoded in test files.

---

## Test Files

Evaluation tests live in `tests/evaluation/` and use the Python `deepeval` framework — separate from the TypeScript Jest unit tests:

```
tests/
└── evaluation/
    ├── conftest.py
    └── test_weekly_recap_summary.py
```

Example test structure:

```python
import pytest
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric, HallucinationMetric

dataset = EvaluationDataset()
dataset.pull(alias="weekly-recap-v1")  # pulls from Confident AI

@pytest.mark.parametrize("test_case", dataset.test_cases)
def test_weekly_recap_summary(test_case):
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
        HallucinationMetric(threshold=0.5),
    ])
```

---

## CI/CD Integration

`deepeval run` executes after a successful deployment to each environment:

```yaml
- name: Run LLM evaluation
  run: deepeval run tests/evaluation/
  env:
    CONFIDENT_API_KEY: ${{ secrets.CONFIDENT_API_KEY }}
```

Results are streamed to the Confident AI dashboard under the project for the target environment. If scores fall below configured thresholds, the step fails and the deployment is flagged.

---

## Authentication & Multi-Environment Pattern

| Rule | Detail |
|---|---|
| Identical secret name across environments | `CONFIDENT_API_KEY` is the same string in dev, qa, and prod CI secrets and GCP Secret Manager |
| One Confident AI project per environment | Dev, qa, and prod datasets and results are isolated by project |
| No env conditionals in code | The CI/CD job targets a specific environment's API key via its secret |
