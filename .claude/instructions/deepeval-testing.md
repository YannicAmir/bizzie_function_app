# DeepEval & Confident AI — LLM Testing Best Practices

Authoritative reference for writing DeepEval evaluation tests, configuring metrics, integrating with Confident AI, and running evaluations in CI/CD. All information is sourced from the official DeepEval documentation at `deepeval.com/docs`.

---

## 1. Environment Variables

Set these before running any evaluation. All LLM-as-a-judge metrics call OpenAI by default.

```bash
# Required for all LLM-as-a-judge metrics (default judge: gpt-4.1)
export OPENAI_API_KEY="sk-..."

# Required for Confident AI integration (test run upload, dataset push/pull)
export CONFIDENT_API_KEY="confident_us..."

# Required if using Gemini as judge via environment variable shorthand
export GOOGLE_API_KEY="..."
export GEMINI_MODEL_NAME="gemini-2.5-pro"   # optional, sets default model
export USE_GEMINI_MODEL=1                    # activates Gemini judge shorthand

# EU data residency only
export CONFIDENT_BASE_URL="https://eu.api.confident-ai.com"

# Optional: change where local results are stored
export DEEPEVAL_RESULTS_FOLDER="./eval-results"

# Optional: disable automatic .env file loading
export DEEPEVAL_DISABLE_DOTENV=1
```

In CI/CD (GitHub Actions example):

```yaml
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  CONFIDENT_API_KEY: ${{ secrets.CONFIDENT_API_KEY }}
```

---

## 2. Authentication — `deepeval login`

### Interactive login (prompts for key)

```bash
deepeval login
```

### Non-interactive login (CI/CD)

```bash
deepeval login --confident-api-key "your-confident-api-key"
```

### Save to a custom dotenv path

```bash
deepeval login --confident-api-key "ck_..." --save dotenv:.env.custom
```

### Python programmatic login

```python
import deepeval
deepeval.login("your-confident-api-key")
```

The key is persisted to `.env.local` by default. Secrets are never written to the JSON keystore.

---

## 3. `LLMTestCase` — Constructor Fields

```python
from deepeval.test_case import LLMTestCase

test_case = LLMTestCase(
    input="...",                    # REQUIRED for almost all metrics
    actual_output="...",            # REQUIRED for almost all metrics
    expected_output="...",          # Required by: ContextualPrecision, ContextualRecall, Summarization, GEval (when referenced)
    context=["...", "..."],         # Required by: Hallucination
    retrieval_context=["...", "..."],# Required by: Faithfulness, ContextualPrecision, ContextualRecall, ContextualRelevancy
    tools_called=[ToolCall(...)],   # Required by: ToolCorrectness
    expected_tools=[ToolCall(...)], # Required by: ToolCorrectness
    token_cost=0.003,               # Optional — logged to Confident AI
    completion_time=1.2,            # Optional — logged to Confident AI (seconds)
    name="test-case-001",           # Optional — labels the test case on Confident AI
    tags=["rag", "billing"],        # Optional — filter/search on Confident AI
)
```

### Field reference

| Field | Type | Required by default | Purpose |
|---|---|---|---|
| `input` | `str` | Almost all metrics | The user query or prompt sent to the LLM |
| `actual_output` | `str` | Almost all metrics | The LLM's response being evaluated |
| `expected_output` | `str` | ContextualPrecision, ContextualRecall, Summarization, GEval (when referenced) | The ideal/ground-truth answer |
| `context` | `list[str]` | Hallucination | Ground-truth facts the LLM has access to |
| `retrieval_context` | `list[str]` | Faithfulness, ContextualPrecision, ContextualRecall, ContextualRelevancy | Chunks retrieved from the RAG pipeline |
| `tools_called` | `list[ToolCall]` | ToolCorrectness | Tools the agent actually invoked |
| `expected_tools` | `list[ToolCall]` | ToolCorrectness | Tools that ideally should have been called |
| `token_cost` | `float` | None | Cost of the LLM call; logged as metadata |
| `completion_time` | `float` | None | Latency in seconds; logged as metadata |
| `name` | `str` | None | Identifier for this test case on Confident AI |
| `tags` | `list[str]` | None | Labels for filtering on Confident AI |

### `ToolCall` structure

```python
from deepeval.test_case import ToolCall

ToolCall(
    name="search_web",           # required
    # input_parameters={"query": "..."},  # optional, for stricter validation
    # output="...",                        # optional, for stricter validation
)
```

---

## 4. All Available Metrics

### 4.1 RAG — Retriever Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `ContextualPrecisionMetric` | `deepeval.metrics` | `input`, `actual_output`, `expected_output`, `retrieval_context` | Measures whether retrieved chunks are focused and ranked well |
| `ContextualRecallMetric` | `deepeval.metrics` | `input`, `actual_output`, `expected_output`, `retrieval_context` | Measures if retrieved context covers all facts in the expected answer |
| `ContextualRelevancyMetric` | `deepeval.metrics` | `input`, `actual_output`, `retrieval_context` | Measures if retrieved context is relevant to the query |

### 4.2 RAG — Generator Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `AnswerRelevancyMetric` | `deepeval.metrics` | `input`, `actual_output` | Measures if the response actually answers the question |
| `FaithfulnessMetric` | `deepeval.metrics` | `input`, `actual_output`, `retrieval_context` | Detects when the LLM contradicts or fabricates beyond the retrieved context |
| `HallucinationMetric` | `deepeval.metrics` | `input`, `actual_output`, `context` | Like Faithfulness but uses `context` (ground-truth) instead of `retrieval_context` |

### 4.3 Custom / Flexible Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `GEval` | `deepeval.metrics` | `input`, `actual_output` + any referenced in criteria | Subjective criteria: correctness, coherence, tone, helpfulness |
| `DAGMetric` | `deepeval.metrics` | `input`, `actual_output` + criteria-dependent | Deterministic decision-tree evaluation; use when exact scores matter |

### 4.4 Agentic Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `ToolCorrectnessMetric` | `deepeval.metrics` | `input`, `actual_output`, `tools_called`, `expected_tools` | Evaluates correct tool selection and call ordering in agents |

### 4.5 Safety Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `BiasMetric` | `deepeval.metrics` | `input`, `actual_output` | Detect demographic or ideological bias in outputs |
| `ToxicityMetric` | `deepeval.metrics` | `input`, `actual_output` | Detect harmful, offensive, or abusive language |

### 4.6 Other Metrics

| Metric | Import | Required `LLMTestCase` fields | When to use |
|---|---|---|---|
| `SummarizationMetric` | `deepeval.metrics` | `input`, `actual_output` | Evaluate summary quality: factual alignment + coverage |
| `JsonCorrectnessMetric` | `deepeval.metrics` | `actual_output` | Verify the output is valid and schema-correct JSON |

---

## 5. GEval — Best Practices

`GEval` uses an LLM-as-judge with chain-of-thought prompting. The quality of the criteria string directly determines reliability.

### Constructor

```python
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams

metric = GEval(
    name="Correctness",                          # required
    criteria="...",                              # required (or use evaluation_steps)
    evaluation_params=[                          # required — only include what is referenced
        LLMTestCaseParams.INPUT,
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT,
    ],
    threshold=0.5,                               # default
    model="gpt-4.1",                             # default
    strict_mode=False,                           # True → binary 0/1 scoring
    async_mode=True,
    verbose_mode=False,
)
```

### `LLMTestCaseParams` enum values

```python
LLMTestCaseParams.INPUT
LLMTestCaseParams.ACTUAL_OUTPUT
LLMTestCaseParams.EXPECTED_OUTPUT
LLMTestCaseParams.RETRIEVAL_CONTEXT
LLMTestCaseParams.CONTEXT
LLMTestCaseParams.TOOLS_CALLED
```

Only include params that are actually mentioned in `criteria` or `evaluation_steps`. Including extra params reduces accuracy.

### Writing good `criteria`

**Good criteria** — specific, actionable, references the fields being evaluated:

```
"Determine whether the actual output is factually correct based on the expected output."

"Determine whether the actual output addresses the user's question in the input directly and without unnecessary padding."

"Determine whether the actual output maintains a professional and helpful tone appropriate for a business support context."
```

**Bad criteria** — vague, multi-dimensional, unmeasurable:

```
"Check the quality of the response."            # too vague
"Is the answer good, relevant, and correct?"    # multiple dimensions in one metric
"Make sure it's helpful."                       # no reference to comparison baseline
```

**Rules for criteria strings:**
- One criterion per `GEval` instance — split multi-dimensional criteria into separate metrics.
- Always state the evaluation target explicitly: "the actual output", "the expected output", "the user's input".
- Use simple, declarative language. Avoid conditional logic (use `DAGMetric` instead).
- Keep the criteria to 1–3 sentences.

### `criteria` vs `evaluation_steps`

- **`criteria`**: DeepEval auto-generates evaluation steps via CoT. Good for exploration.
- **`evaluation_steps`**: You provide explicit step-by-step instructions. More reliable and reproducible for production.

**Recommended workflow:** Write a `criteria` first, observe the auto-generated steps via `verbose_mode=True`, then copy and refine those steps as `evaluation_steps` for production.

```python
# Production: prefer explicit evaluation_steps
metric = GEval(
    name="Correctness",
    evaluation_steps=[
        "Check whether the facts in 'actual output' contradict any facts in 'expected output'.",
        "Penalise if the 'actual output' omits critical information present in 'expected output'.",
        "Score 1 if all facts align and no omissions exist, 0 if contradictions are found.",
    ],
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
)
```

### Rubrics (optional — confine score ranges)

```python
from deepeval.metrics import GEval
from deepeval.metrics.g_eval import Rubric

metric = GEval(
    name="Quality",
    criteria="Evaluate the overall quality of the response.",
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
    rubric=[
        Rubric(score_range=(0, 2), expected_outcome="Completely incorrect or harmful"),
        Rubric(score_range=(3, 6), expected_outcome="Partially correct but missing key information"),
        Rubric(score_range=(7, 9), expected_outcome="Mostly correct with minor issues"),
        Rubric(score_range=(10, 10), expected_outcome="Perfect response"),
    ],
)
```

Score ranges must not overlap and must use inclusive boundaries.

---

## 6. Recommended Thresholds

All metrics default to `threshold=0.5`. Treat 0.5 as a starting point, not a production standard. The table below gives practical guidance.

| Metric | Default | Conservative (high precision) | Lenient (high recall) | Notes |
|---|---|---|---|---|
| `AnswerRelevancyMetric` | 0.5 | 0.7 | 0.4 | Raise if users frequently complain about irrelevant answers |
| `FaithfulnessMetric` | 0.5 | 0.8 | 0.5 | Raise for high-stakes domains (medical, legal, financial) |
| `HallucinationMetric` | 0.5 | 0.2 (max threshold) | 0.5 | **Lower is better** — this is a *maximum* threshold |
| `ContextualPrecisionMetric` | 0.5 | 0.7 | 0.4 | Depends on retrieval pipeline quality |
| `ContextualRecallMetric` | 0.5 | 0.7 | 0.4 | Raise if missing facts are critical |
| `ContextualRelevancyMetric` | 0.5 | 0.7 | 0.4 | Raise for narrow-domain Q&A |
| `GEval` | 0.5 | 0.7 | 0.4 | Calibrate by reviewing borderline cases |
| `BiasMetric` | 0.5 | 0.2 (max threshold) | 0.5 | **Lower is better** — maximum threshold |
| `ToxicityMetric` | 0.5 | 0.1 (max threshold) | 0.3 | **Lower is better** — near-zero tolerance recommended |
| `SummarizationMetric` | 0.5 | 0.7 | 0.5 | Min of alignment + coverage scores |

**`strict_mode=True`** sets threshold to 1.0 (binary pass/fail). Use only when zero tolerance is required.

---

## 7. `deepeval test run` — CLI Flags

```bash
deepeval test run <test_file.py> [flags]
```

Always use `deepeval test run` instead of plain `pytest`. It provides LLM-specific functionality unavailable in standard pytest.

| Flag | Full usage | Purpose |
|---|---|---|
| `-n <int>` | `-n 4` | Parallelise test cases across N processes |
| `-c` | `-c` | Use cached results; skip re-evaluating already-passed test cases |
| `-i` | `-i` | Ignore metric errors; continue the run instead of aborting |
| `-s` | `-s` | Skip metrics when a required `LLMTestCase` field is `None` |
| `-v` | `-v` | Verbose mode — print intermediate calculation steps for all metrics |
| `-id <str>` | `-id "sprint-42-rag"` | Name this test run for identification on Confident AI |
| `-d <filter>` | `-d failing` | Display only `all`, `passing`, or `failing` test cases in terminal |
| `-r <int>` | `-r 3` | Repeat each test case N times (useful for measuring score variance) |

**Common combinations:**

```bash
# Parallel run, cache hits, ignore errors
deepeval test run test_rag.py -n 4 -c -i

# Named run with verbose output, show only failures
deepeval test run test_rag.py -id "release-1.4" -v -d failing

# CI/CD: parallel, cache, named, skip missing params
deepeval test run test_rag.py -n 8 -c -s -id "ci-${{ github.run_id }}"
```

---

## 8. `evaluate()` vs `assert_test()`

### When to use each

| Function | Use when | Runner |
|---|---|---|
| `assert_test()` | Writing pytest test files for CI/CD, using `deepeval test run` | `deepeval test run` |
| `evaluate()` | Python scripts, Jupyter notebooks, one-off batch evaluations | Direct Python execution |

### `assert_test()` — signature

```python
from deepeval import assert_test

assert_test(
    test_case=test_case,        # required: LLMTestCase instance
    metrics=[metric1, metric2], # required: list[BaseMetric]
    run_async=True,             # optional: concurrent metric evaluation (default True)
)
```

Used inside standard `def test_*()` functions. Raises `AssertionError` on failure, which pytest captures.

### `evaluate()` — signature

```python
from deepeval import evaluate

results = evaluate(
    test_cases=[tc1, tc2],      # required: list[LLMTestCase] or EvaluationDataset
    metrics=[metric1, metric2], # required: list[BaseMetric]
    hyperparameters={           # optional: logged to Confident AI
        "model": "gpt-4.1",
        "prompt_version": "v3",
    },
    identifier="batch-eval-001", # optional: names this run on Confident AI
    async_config=AsyncConfig(
        run_async=True,
        throttle_value=0,        # seconds between async calls
        max_concurrent=20,       # max parallel evaluations
    ),
    display_config=DisplayConfig(
        verbose_mode=False,
        print_results=True,
    ),
    error_config=ErrorConfig(
        skip_on_missing_params=False,
        ignore_errors=False,
    ),
    cache_config=CacheConfig(
        use_cache=False,
        write_cache=True,
    ),
)
```

---

## 9. `EvaluationDataset` and `Golden`

### `Golden` — the pre-evaluation record

A `Golden` stores the input and expected values before your LLM app has run. Fields populated at evaluation time (`actual_output`, `retrieval_context`, `tools_called`) are `None` until evaluated.

```python
from deepeval.dataset import EvaluationDataset, Golden

golden = Golden(
    input="What is the refund policy?",          # required
    expected_output="30-day full refund...",      # optional
    context=["Our refund policy states..."],      # optional
    expected_tools=[ToolCall(name="lookup_policy")],  # optional
    additional_metadata={"category": "billing"},  # optional
    comments="Edge case — item was opened",       # optional
    custom_column_key_values={"source": "zendesk"}, # optional
)
```

### `EvaluationDataset` — creating and managing

```python
# Empty dataset
dataset = EvaluationDataset()

# Pre-populated
dataset = EvaluationDataset(goldens=[golden1, golden2])

# Add individually
dataset.add_golden(golden)
dataset.add_test_case(test_case)  # for LLMTestCase objects
```

### Pushing to Confident AI

```python
dataset.push(alias="Billing Q&A — v2")

# Draft mode — not pulled until manually finalised on platform
dataset.push(alias="WIP Dataset", finalized=False)
```

### Pulling from Confident AI

```python
dataset = EvaluationDataset()
dataset.pull(alias="Billing Q&A — v2")

# Access goldens
for golden in dataset.goldens:
    print(golden.input, golden.expected_output)
```

### Local file operations

```python
# Save
dataset.save_as(file_type="json", directory="./datasets")
dataset.save_as(file_type="csv", directory="./datasets", file_name="billing-v2")

# Load from JSON
dataset.add_goldens_from_json_file(file_path="./datasets/billing-v2.json")

# Load from CSV
dataset.add_test_cases_from_csv_file(
    file_path="./datasets/billing-v2.csv",
    input_col_name="question",
    actual_output_col_name="answer",
    expected_output_col_name="expected",
    context_col_name="context",
    context_col_delimiter=";",
    retrieval_context_col_name="retrieved_chunks",
    retrieval_context_col_delimiter=";",
)
```

---

## 10. pytest Patterns

### Standard test file structure

```python
# tests/eval_rag.py
import pytest
import asyncio
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric

dataset = EvaluationDataset()
dataset.pull(alias="RAG Evals — v1")  # pull once at module level

@pytest.mark.parametrize("golden", dataset.goldens)
def test_rag_pipeline(golden: Golden):
    # Arrange — run your LLM app
    result = your_rag_app(golden.input)

    # Build test case
    test_case = LLMTestCase(
        input=golden.input,
        actual_output=result["answer"],
        retrieval_context=result["retrieved_chunks"],
        expected_output=golden.expected_output,
    )

    # Assert
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
    ])
```

### Async LLM apps — use `asyncio.run()` inside the test function

DeepEval test functions are **synchronous** by default (plain `def`, not `async def`). If your LLM app is async, call it with `asyncio.run()`:

```python
@pytest.mark.parametrize("golden", dataset.goldens)
def test_async_pipeline(golden: Golden):
    # Call async app synchronously inside the test
    result = asyncio.run(your_async_rag_app(golden.input))

    test_case = LLMTestCase(
        input=golden.input,
        actual_output=result["answer"],
        retrieval_context=result["retrieved_chunks"],
    )
    assert_test(test_case, [AnswerRelevancyMetric(threshold=0.7)])
```

Do **not** use `pytest-asyncio` (`async def test_*`) with DeepEval — use synchronous test functions and `asyncio.run()` for any async calls.

DeepEval handles its own internal async concurrency through `async_mode=True` on metrics (the default). This is independent of whether your test function is async.

### Logging hyperparameters with `@deepeval.log_hyperparameters`

Place a `conftest.py` in the test directory:

```python
# tests/conftest.py
import deepeval

@deepeval.log_hyperparameters(model="gpt-4.1", prompt_template="v3")
def hyperparameters():
    # Return any dict[str, str | int | float]
    return {
        "model": "gpt-4.1",
        "system_prompt_version": "v3",
        "retrieval_top_k": 5,
    }
```

This is the **only** DeepEval-specific fixture pattern. DeepEval does not define custom pytest markers — it uses standard `@pytest.mark.parametrize`.

### No `conftest.py` fixtures required for basic evaluation

DeepEval does not require any custom pytest fixtures (no `@pytest.fixture` setup). Metrics and datasets are instantiated at module level.

---

## 11. `deepeval test run` vs `pytest`

Always prefer `deepeval test run test_file.py` over running `pytest test_file.py` directly. The DeepEval runner provides:

- Automatic upload of results to Confident AI (if `CONFIDENT_API_KEY` is set)
- LLM-specific flags (`-n`, `-c`, `-i`, `-s`, `-id`, etc.)
- Proper handling of metric async execution

---

## 12. Custom Judge Models

### Option A: Use `GeminiModel` (built-in)

```python
from deepeval.models import GeminiModel
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric, GEval

model = GeminiModel(
    model="gemini-2.5-pro",
    api_key="your-google-api-key",   # or set GOOGLE_API_KEY env var
    temperature=0,
)

# Pass to any metric
answer_relevancy = AnswerRelevancyMetric(model=model, threshold=0.7)
faithfulness = FaithfulnessMetric(model=model, threshold=0.8)
```

**Environment variable shorthand** (no explicit model object needed):

```bash
export USE_GEMINI_MODEL=1
export GOOGLE_API_KEY="..."
export GEMINI_MODEL_NAME="gemini-2.5-pro"
```

Then metrics use Gemini automatically when `model` is omitted.

**Available Gemini models:** `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-3-pro-preview`

### Option B: Implement `DeepEvalBaseLLM` for any custom provider

Required for Vertex AI workload identity, custom proxies, or any non-standard provider.

```python
from pydantic import BaseModel
import google.generativeai as genai
import instructor
from deepeval.models import DeepEvalBaseLLM

class CustomGeminiFlash(DeepEvalBaseLLM):
    def __init__(self):
        self.model = genai.GenerativeModel("models/gemini-2.5-flash")

    def load_model(self):
        return self.model

    def generate(self, prompt: str, schema: BaseModel) -> BaseModel:
        client = self.load_model()
        instructor_client = instructor.from_gemini(
            client=client,
            mode=instructor.Mode.GEMINI_JSON,
        )
        return instructor_client.messages.create(
            messages=[{"role": "user", "content": prompt}],
            response_model=schema,
        )

    async def a_generate(self, prompt: str, schema: BaseModel) -> BaseModel:
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return "Gemini 2.5 Flash"

# Use in any metric
judge = CustomGeminiFlash()
metric = GEval(
    name="Correctness",
    criteria="...",
    evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
    model=judge,
)
```

**Required methods in `DeepEvalBaseLLM`:**

| Method | Signature | Purpose |
|---|---|---|
| `get_model_name()` | `() -> str` | Returns a display name for the model |
| `load_model()` | `() -> Any` | Returns the instantiated model object |
| `generate()` | `(prompt: str) -> str` or `(prompt: str, schema: BaseModel) -> BaseModel` | Synchronous generation |
| `a_generate()` | `(prompt: str) -> str` or `(prompt: str, schema: BaseModel) -> BaseModel` | Async generation |

Both `generate` signatures (plain string and schema-confined) should be supported when using structured output metrics.

---

## 13. Test Run Identification on Confident AI

### Using the CLI flag (recommended for CI/CD)

```bash
deepeval test run test_rag.py -id "release-v1.4-$(date +%Y%m%d)"
deepeval test run test_rag.py -id "ci-$GITHUB_RUN_ID"
```

### Using `evaluate()` identifier parameter

```python
evaluate(
    test_cases=dataset,
    metrics=[...],
    identifier="sprint-42-billing-rag",
    hyperparameters={"model": "gpt-4.1", "retrieval_k": 5},
)
```

### Naming conventions

- Use a consistent prefix scheme: `<service>-<env>-<version>` e.g. `bizzie-chat-prod-v2.1`
- Include the git SHA or CI run ID for traceability: `bizzie-chat-ci-abc1234`
- Use `hyperparameters` to log prompt version, model, retrieval settings alongside each run

---

## 14. Quick Reference — Full Working Example

```python
# tests/eval_billing_rag.py
import asyncio
import pytest
import deepeval
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualPrecisionMetric,
    GEval,
)

# Pull dataset from Confident AI once
dataset = EvaluationDataset()
dataset.pull(alias="Billing RAG — v2")

@deepeval.log_hyperparameters(model="gpt-4.1", prompt_version="v3")
def hyperparameters():
    return {"model": "gpt-4.1", "retrieval_top_k": 5, "prompt_version": "v3"}

# Define metrics once
answer_relevancy = AnswerRelevancyMetric(threshold=0.7)
faithfulness = FaithfulnessMetric(threshold=0.8)
contextual_precision = ContextualPrecisionMetric(threshold=0.7)
correctness = GEval(
    name="Correctness",
    evaluation_steps=[
        "Check whether facts in 'actual output' contradict 'expected output'.",
        "Penalise omissions of critical information.",
        "Score 1 if fully correct, 0 if contradictions found.",
    ],
    evaluation_params=[
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT,
    ],
    threshold=0.7,
)

@pytest.mark.parametrize("golden", dataset.goldens)
def test_billing_rag(golden: Golden):
    # Run your async app synchronously
    result = asyncio.run(billing_rag_app(golden.input))

    test_case = LLMTestCase(
        input=golden.input,
        actual_output=result["answer"],
        retrieval_context=result["chunks"],
        expected_output=golden.expected_output,
        name=golden.input[:60],
    )

    assert_test(test_case, [
        answer_relevancy,
        faithfulness,
        contextual_precision,
        correctness,
    ])
```

Run in CI/CD:

```bash
deepeval test run tests/eval_billing_rag.py -n 4 -c -s -id "billing-rag-$GITHUB_RUN_ID"
```

---

## 15. DeepEval-Specific Decorators and Markers Summary

| Decorator / Marker | Module | Purpose |
|---|---|---|
| `@deepeval.log_hyperparameters(...)` | `deepeval` | Attaches hyperparameter metadata to the test run on Confident AI |
| `@pytest.mark.parametrize(...)` | `pytest` (standard) | The primary pattern for iterating over Goldens or test cases |
| `@observe(...)` | `deepeval.tracing` | Instruments functions for component-level evaluation and tracing |

DeepEval does **not** define custom `@pytest.mark.*` markers. There is no `@pytest.mark.deepeval` or similar.

---

## Sources

- [DeepEval Getting Started](https://deepeval.com/docs/getting-started)
- [Single-Turn Test Case](https://deepeval.com/docs/evaluation-test-cases)
- [Metrics Introduction](https://deepeval.com/docs/metrics-introduction)
- [G-Eval](https://deepeval.com/docs/metrics-llm-evals)
- [DAG Metric](https://deepeval.com/docs/metrics-dag)
- [Answer Relevancy](https://deepeval.com/docs/metrics-answer-relevancy)
- [Faithfulness](https://deepeval.com/docs/metrics-faithfulness)
- [Hallucination](https://deepeval.com/docs/metrics-hallucination)
- [Contextual Precision](https://deepeval.com/docs/metrics-contextual-precision)
- [Contextual Recall](https://deepeval.com/docs/metrics-contextual-recall)
- [Contextual Relevancy](https://deepeval.com/docs/metrics-contextual-relevancy)
- [Bias](https://deepeval.com/docs/metrics-bias)
- [Summarization](https://deepeval.com/docs/metrics-summarization)
- [Tool Correctness](https://deepeval.com/docs/metrics-tool-correctness)
- [Evaluation Introduction](https://deepeval.com/docs/evaluation-introduction)
- [Flags and Configs](https://deepeval.com/docs/evaluation-flags-and-configs)
- [Datasets](https://deepeval.com/docs/evaluation-datasets)
- [Unit Testing in CI/CD](https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd)
- [CLI Settings](https://deepeval.com/docs/command-line-interface)
- [Using Custom LLMs](https://deepeval.com/guides/guides-using-custom-llms)
- [Gemini Integration](https://deepeval.com/integrations/models/gemini)
- [Confident AI Setup](https://www.confident-ai.com/docs/setup-and-installation)
