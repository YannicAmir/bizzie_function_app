---
name: Logic Extraction Steps
description: Step-by-step process for analyzing LangGraph features and defining evaluation requirements.
---

# DeepEval Logic Extraction — Step-by-Step Process

Follow these phases to transform a LangGraph implementation into a set of clear "Intended Behavior" requirements.

---

## Phase 1: Feature Anatomy

1.  **Analyze the `graph.py`**:
    *   Identify all `nodes` and `conditional_edges`.
    *   Map the specific "exit" paths (e.g., successful answer, refusal, error).
2.  **Analyze the `state.py`**:
    *   Identify critical state variables (e.g., `is_off_topic`, `route_path`, `confidence_score`).
3.  **Analyze Node Implementation**:
    *   Examine the system prompts for each node (especially the "Guardian" or "Router").
    *   Identify what the agent is *explicitly instructed* to do for different inputs.

---

## Phase 2: Defining Intended Behavior

For each identified path, define a "Logic-Aware Expectation":

1.  **The "Pass" Condition**:
    *   What constitutes a successful outcome for this path?
    *   *Example (Off-Topic)*: "The agent MUST refuse the request and state it is a financial assistant. This is a PASS even if it does not answer the user's literal question."
2.  **Metric Selection**:
    *   Choose the correct DeepEval metric (e.g., `AnswerRelevancy` for good answers, `GEval` for refusals).
3.  **Retrieval Expectations**:
    *   Define what *kind* of context should be present for this path (if any).

---

## Phase 3: Generating `synthesizer_info.md`

Produce a structured documentation file in the feature directory (e.g., `src/features/[feature]/agent/tests/synthesizer_info.md`).

**Structure**:
```markdown
# Synthesizer Info: [Feature Name]

## Analysis & Intent
[Summary of the graph's goal]

## Evaluation Requirements (Logic-Aware)

### Path: [Path Name, e.g., 'Exit/Off-Topic']
- **Input Patterns**: [Examples of queries that trigger this path]
- **Pass Criteria**: [What is considered a PASS for this path]
- **Recommended Metric**: [e.g., G-Eval with specific criteria]
- **Threshold**: [Recommended threshold]

### Path: [Path Name, e.g., 'Financial Advice']
...
```

---

## Verification Checklist

- [ ] `synthesizer_info.md` document created in the feature's `tests/` directory.
- [ ] Intent of the graph (including specialized refusals) is clearly defined.
- [ ] Metric-Prompt mismatches are explicitly addressed.
- [ ] Requirements are actionable for the `deepeval-feature-tester` skill.
