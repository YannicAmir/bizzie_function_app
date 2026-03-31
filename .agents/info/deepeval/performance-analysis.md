# DeepEval Test Performance Analysis

Based on the 20% pass rate (1/5 tests) observed in the [latest run](https://app.confident-ai.com/project/cmmxrk18i0006pq1ebuei5jfk/test-runs/cmn9brcx40016qf1eytvwmxmn/test-cases), here is a breakdown of why tests are failing and how to fix them.

## 1. Metric-Prompt Mismatch (The "Exit" Problem)

**Failed Test**: `test_exit_routing_off_topic`  
**Input**: "How do I make a chocolate cake?"  
**Actual Output**: "I'm Bizzie's stock market assistant — I can help with questions about Intuit Inc..."

### Why it failed:
You are using the `AnswerRelevancyMetric`. This metric specifically asks: "Does the output answer the user's question accurately?"
- **The Judge's Logic**: "No, the output doesn't tell me how to make a cake. Score: 0.33."
- **The Reality**: The agent did the right thing by refusing an off-topic question!

### The Fix:
For negative test cases (off-topic queries), do NOT use `AnswerRelevancy`. Instead:
- Use a **custom G-Eval** metric that measures "Polite Refusal" or "Topic Guarding".
- **Industry Standard**: Define a requirement that the agent must politely steer the user back to stocks.

---

## 2. Threshold Calibration (The standard "Cold Start")

Most of your tests failed with scores in the **0.4 - 0.6** range, while your threshold is set to **0.7**.

### Why it failed:
Initial LLM responses often have small semantic gaps that the judge penalizes. For example, if the model says "The stock is up" but doesn't mention the exact percentage retrieved in the context, the `Faithfulness` or `Relevancy` scores will drop.

### The Fix:
- During the "Development" phase, lower your thresholds to **0.5**.
- Tighten them to **0.7** once you have optimized your prompts.
- **Goal**: Do not block yourself on "perfection" when you are still building the foundation.

---

## 3. Retrieval Context Requirements

Several failures in the `test_ambassador` and `test_guardian` cases suggest the judge expected more factual alignment with the context.

### The Fix:
Check if your `retrieval_context` in the test case matches what the agent *actually* saw.
- If the test provides context A, but the agent uses context B, the judge will see a discrepancy.
- **Professional Setup**: Ensure the `retrieval_context` in your `LLMTestCase` is exactly what was passed to the LLM during the run.

---

## Summary of Next Steps for 100% Pass Rate:

1. **Update `test_smoke.py`**:
   - Change `test_exit_routing_off_topic` to use a `G-Eval` metric for "Off-Topic Guarding".
   - Set all thresholds to **0.5** for the current sprint.
2. **Review "Confident AI" Reasons**:
   - Click each "Failed" row in the dashboard.
   - Read the **Reason** column. It is pure gold for prompt engineering.
3. **Draft Goldens**:
   - Save the current "Success" case as a `Golden`.
   - Manually edit the "Actual Output" of failures to show what you *want* the model to say, and save those as goldens.
