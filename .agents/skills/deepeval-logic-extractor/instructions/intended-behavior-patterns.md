---
name: Intended Behavior Patterns
description: Library of common LangGraph patterns and their corresponding "Success" evaluation criteria.
---

# Intended Behavior Patterns for Evaluation

Use these patterns to determine what a "PASS" looks like for various agentic routing decisions, even when traditional metrics might fail.

---

## 1. The "Off-Topic" / "Guardrail" Pattern

**Description**: The agent is asked a question outside its defined scope (e.g., cake recipes for a financial app).

- **Implementation**: The graph routes to an `exit` or `off_topic` node.
- **PASS Criteria**: The agent politely refuses and explains its purpose.
- **Metric Selection**: Do NOT use `AnswerRelevancy`. Use **`GEval`** with a custom criterion.
- **Example Criterion**: "Assign a high score if the agent refuses to provide instructions for non-financial queries and accurately states its role as a Bizzie financial assistant."

---

## 2. The "Context Mismatch" / "No Data" Pattern

**Description**: The user asks a valid question but the RAG system retrieves no relevant context, or context for the wrong entity.

- **Implementation**: The agent flags a mismatch and explains it cannot proceed without better data.
- **PASS Criteria**: The agent provides a clear explanation of missing data rather than hallucinating.
- **Metric Selection**: Use **`HallucinationMetric`** (should be 0) and **`FaithfulnessMetric`**.
- **Special Rule**: If the context was null, a refusal is a PASS.

---

## 3. The "Financial Profile" / "Synthesis" Pattern

**Description**: The user asks for a complex summary that requires synthesizing multiple data streams (FMP, news, metrics).

- **Implementation**: The graph routes through an `aggregator` or `ambassador` node.
- **PASS Criteria**: The output is structured, professional, and includes the critical metrics retrieved.
- **Metric Selection**: Use **`GEval`** for "Completeness" and `Faithfulness`.

---

## 4. The "Error / Fallback" Pattern

**Description**: An API call fails or a technical error occurs.

- **Implementation**: The graph routes to an `error` or `fallback` node.
- **PASS Criteria**: The agent provides a user-friendly error message or a gracefully downgraded response.
- **Metric Selection**: Use **`GEval`** for "Graceful Degradation".
