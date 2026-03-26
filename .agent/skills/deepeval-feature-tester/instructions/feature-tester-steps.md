---
name: DeepEval Feature Tester Steps
description: Workflow for designing and implementing evaluation suites for LLM features.
---

# DeepEval Feature Implementation Steps

Follow these phases to design and implement evaluation tests for a specific feature.

---

## Phase 1: Feature Analysis

1.  **Analyze Feature**: Identify the target feature and its LLM nodes (guardian, tool-caller, summarizer, etc.).
2.  **Define Coverage**: Decide whether to test individual nodes (unit) or the entire graph (end-to-end).
3.  **Map Metrics**: Select the appropriate DeepEval metrics for each test case (Relevancy, Faithfulness, GEval, etc.).

---

## Phase 2: Design & Planning

1.  **Draft Implementation Plan**:
    - List the test scenarios (queries, expected outputs, context).
    - Map each scenario back to a specific DeepEval metric and threshold.
2.  **Confirm with User**: Seek explicit approval before writing code.

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
