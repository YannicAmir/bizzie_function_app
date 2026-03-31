---
name: LangGraph Inspection Steps
description: Process for auditing and reporting on LangGraph flows for standards compliance.
---

# LangGraph Inspection Steps

Follow these phases to audit a LangGraph agent flow and its integration.

---

## Phase 1: Context Capture

1.  **Identify Feature**: Get the feature name from the user.
2.  **Collect Files**: Read all files in the LangGraph implementation (`state.py`, `nodes.py`, `graph.py`, `config.py`, `requirements.txt`).
3.  **Analyze Integration**: Read `services/langgraph_service.ts` and `usecase.ts` in the TypeScript layer.

---

## Phase 2: Audit & Evaluation

1.  **Run Standards Compliance Checklist**: Evaluate the implementation against all items in the **LangGraph Enterprise Standards**.
2.  **Assess Quality & Costs**: Monitor for token budget issues, context growth, and model tiering.
3.  **Evaluate Integration**: Confirm that the TypeScript orchestrator is correctly decoupled from the Python graph internals.

---

## Phase 3: Reporting & Recovery

1.  **Generate Report**: Create `.claude/docs/inspections/[feature_name]_inspection.md`.
2.  **Categorize Issues**: Label findings as Critical (must fix), Recommended (should fix), or Suggestions (optional).
3.  **Offer Fixes**: For each critical issue discovered, offer to implement a fix immediately.

---

## Verification Checklist

- [ ] All LangGraph implementation files are analyzed.
- [ ] Compliance checklist from shared standards is fully applied.
- [ ] Integration and decoupling of TypeScript/Python layers is verified.
- [ ] Detailed inspection report is created.
- [ ] Practical fixes are offered for critical violations.
- [ ] All paths are project-root-relative.
