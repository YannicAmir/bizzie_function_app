---
name: DeepEval Feature Tester Steps
description: Workflow for designing and implementing evaluation suites for LLM features.
---

# DeepEval Feature Implementation Steps

Follow these phases to design and implement evaluation tests for a specific feature.

---

## Phase 1: Logic Extraction (NEW)

1.  **Call `deepeval-logic-extractor`**: Analyze the LangGraph implementation to define "Intended Behavior".
2.  **Generate `synthesizer_info.md`**: Store the analysis and metric requirements in `src/features/[feature]/agent/tests/synthesizer_info.md`.
3.  **Define Pass/Fail Logic**: Explicitly document that refusals for off-topic queries are a PASS and should use G-Eval.

## Phase 2: Scenario Mapping

1.  **Analyze Feature**: Identify the target feature and its LLM nodes (guardian, tool-caller, summarizer, etc.).
2.  **Define Coverage**: Decide whether to test individual nodes (unit) or the entire graph (end-to-end).
3.  **Map Metrics**: Select metrics based on the **`synthesizer_info.md`** (e.g., G-Eval for refusals, Relevancy for answers).

## Phase 3: Gold Dataset Seeding

1.  **Draft Initial "Gold" Cases**:
    - Build 10-15 manual cases (Happy Path, Edge Cases, Negative/Exit cases).
    - Align `expected_output` with the **`synthesizer_info.md`** logic.
2.  **Synthetic Expansion**: Configure the `Synthesizer` using the **`synthesizer_info.md`** context to scale to 50+ realistic cases.
3.  **Mapping Metrics**: Assign specific DeepEval metrics and thresholds to each case group.
4.  **Confirm with User**: Review the scenario list before implementation.

---

## Phase 3: Implementation

1.  **Scaffold Test Files**: Create `tests/test_[feature_name]_[type].py`.
2.  **Implement LLMTestCase**: Build test cases with the correct fields (input, actual_output, context, etc.).
3.  **Configure Metrics**: Instantiate and configure DeepEval metrics with specific thresholds and Gemini judge models.
4.  **Async Integration**: Ensure all tests use the `async` pattern to integrate with the LangGraph layer.
5.  **Assert Patterns**: Use `assert_test(test_case, [metrics])` for clean reporting.

---

## Phase 4: Validation & CI/CD

1.  **Run Evaluation**: Assist the user in executing the tests via `deepeval test run` with the correct `-id` and flags.
2.  **Report to Confident AI**: Verify that the results are visible in the Confident AI dashboard.
3.  **Hyperparameter Logging**: Optionally use the `@log_hyperparameters` decorator for performance tracking.

---

## Verification Checklist

- [ ] Feature analysis identifies all target LLM nodes.
- [ ] Test cases are assigned appropriate metrics and thresholds.
- [ ] `LLMTestCase` includes all required fields for the selected metrics.
- [ ] Tests use the `async` pattern.
- [ ] Gemini 2.0 Flash is used as the judge model in the `conftest.py` fixture.
- [ ] `assert_test()` is used for pass/fail compliance.
- [ ] Test runs use unique `-id` for dashboard tracking.
- [ ] All paths follow project-root-relative standards.
