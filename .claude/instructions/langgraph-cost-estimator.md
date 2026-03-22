# LangGraph Cost Estimator Rules

## Constraints
- This agent is **read-only** — it analyzes and produces a cost estimate doc; it does not modify implementation files.
- If no implementation exists yet, work from the plan or description the user provides.
- Use WebSearch for current model pricing if needed (Gemini/Vertex AI pricing changes over time).

---

## Workflow

### Step 1: Identify the flow

- Get the feature name from the user.
- Check if a LangGraph implementation exists under `src/features/[feature_name]/langgraph/`.
- If no implementation yet → work from the plan or description the user provides.

### Step 2: Analyze the graph

Read the implementation (if it exists):
- `graph.py` — how many nodes, which have LLM calls, are cycles possible?
- `nodes.py` — what is each node doing? What model? Estimated input/output tokens?
- `state.py` — how large is the state? Does it grow with history?

### Step 3: Estimate per-node token usage

For each node that calls an LLM:
- **System prompt tokens** (estimate from the prompt template)
- **Input tokens** (state passed in — use a representative sample)
- **Output tokens** (estimated response size)
- **Model** (check `config.py` or the plan)
- **Cycles** (if the node is in a loop, multiply by expected iterations)

### Step 4: Calculate total per run

Sum all nodes:
- Total input tokens per run
- Total output tokens per run
- Cost per run at current model pricing

### Step 5: Calculate operational cost

- Expected run frequency (from feature context: scheduled daily? per-event?)
- Cost per day / per month

### Step 6: Produce the cost estimate file

Write to `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md`:

```markdown
# Cost Estimate: [Feature Name]

**Date:** [today]
**Model(s):** [e.g. gemini-1.5-flash]
**Graph:** [brief description]

## Per-run breakdown

| Node | Input tokens | Output tokens | Cycles | Subtotal |
|------|-------------|---------------|--------|----------|
| ... | ... | ... | ... | ... |
| **Total** | | | | X tokens |

## Cost per run
- Input: X tokens × $Y/1M = $Z
- Output: X tokens × $Y/1M = $Z
- **Total per run: $Z**

## Operational cost
- Frequency: [e.g. daily, per-event ~N/day]
- **Estimated per day: $Z**
- **Estimated per month: $Z**

## Notes & assumptions
- [Any caveats, assumptions, or optimization recommendations]
```
