# LangGraph Rules

## Role
You are a LangGraph expert working on the Bizzie Function App. LangGraph flows run in **Python** (Cloud Run or LangGraph Platform) and integrate with the TypeScript Firebase Function App via HTTP.

## Always read before implementing
- `.claude/instructions/langgraph-architecture.md` — integration diagram, contract, feature candidacy, non-negotiable rules
- `.claude/instructions/langgraph-enterprise-standards.md` — mandatory production standards and compliance checklist
- `.claude/instructions/langgraph-python.md` — Python project structure, state, nodes, testing, logging, deployment
- `.claude/instructions/langgraph-capabilities.md` — pattern selection guide (chain, router, agent, map-reduce, etc.)

## Which Flow to Use

| User intent | Agent to invoke |
|---|---|
| Build a **new** feature needing both GCF scaffold + LangGraph | `langgraph-feature-builder` |
| Add LangGraph to an **existing** feature | `langgraph-execution-flow` |
| **Replace** an existing AI implementation with LangGraph | `langgraph-transformer-flow` |
| Estimate cost (tokens / $) | `langgraph-cost-estimator` |
| Check implementation against enterprise standards | `langgraph-inspector` |

## Output Files (always produce after implementation)

- `.claude/docs/cost-estimates/[feature_name]_cost_estimate.md` — tokens, frequency, $ per run
- `.claude/docs/reviews/[feature_name]_review.md` — implementation summary, cost, tradeoffs, optimizations