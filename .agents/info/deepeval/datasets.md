# DeepEval Datasets: Your Ground Truth

In professional LLM development, you don't test against a single prompt. You test against a **Dataset**. This ensures that as you improve your model's performance on "Question A", you aren't accidentally breaking it on "Question B" (a regression).

## Key Concept: The "Golden"
A `Golden` is a single test case before it is run. It contains:
- **Input**: The user query.
- **Actual Output**: (Optional) What the model actually produced (used during the test run).
- **Expected Output**: (Critical) The "Ground Truth" answer.
- **Context**: The background info the model *should* have used.

---

## 1. Creating Your First Dataset

You can create a dataset manually in a script or load it from a file.

### Manual Creation
```python
from deepeval.dataset import EvaluationDataset
from deepeval.test_case import Golden

dataset = EvaluationDataset()
dataset.add_golden(
    Golden(
        input="What is Intuit's current stock price?",
        expected_output="Intuit (INTU) is trading at $654.20.",
        context=["Retrieved financial data for INTU at 2PM Mar 27."]
    )
)
```

### Loading from CSV/JSON
This is the most common way to manage large sets of test cases.
```python
dataset = EvaluationDataset()
dataset.load_from_json("path/to/my_goldens.json")
```

---

## 2. Using the "Synthesizer" (Pro Feature)
If you don't have enough test cases, use the **Synthesizer** to generate hundreds of realistic ones from your documentation.

```python
from deepeval.synthesizer import Synthesizer

synthesizer = Synthesizer()
# This will read your project docs and create 50 high-quality test cases
dataset.generate_goldens_from_docs(
    document_paths=["docs/financial_info.pdf"],
    max_goldens=50
)
dataset.save_as_json("tests/gold_dataset.json")
```

---

## 3. Cloud Syncing with Confident AI
To share datasets with your team and track performance over time, push them to the cloud.

### Push to Cloud
```bash
# After running your tests
deepeval push --dataset "Bizzie Chat Gold Set"
```

### Pull in CI/CD
In your automated tests, you can pull the latest vetted "Gold Set" from the cloud instead of hardcoding it.
```python
dataset = EvaluationDataset.from_cloud("Bizzie Chat Gold Set")
```

## Professional Tips for Datasets:
1. **Curate your Goldens**: Every time a user reports a bug in production, add that interaction as a new `Golden` to your dataset.
2. **Version Everything**: Use the same dataset name in your `dev` and `prod` environments to compare how your prompts perform across different stages.
3. **Diversity Matters**: Your dataset should include simple queries, complex multi-step queries, and adversarial "off-topic" queries.
