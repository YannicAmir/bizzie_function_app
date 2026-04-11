# LangGraph Capabilities Library

Use this library to choose the right LangGraph pattern for a feature. Map a behavioral description to the right capability — the agent does not need to know these patterns upfront; infer them from what the flow needs to do.

---

## Core graph patterns

| Capability | What it does | When to use |
|------------|--------------|-------------|
| **Chain** | Linear LCEL chains (invoke, stream, batch). | Simple, single-step LLM pipelines (e.g. classify, transform). |
| **Simple graph** | `StateGraph`, nodes, edges, `compile()`. | Multi-step flows without branching (e.g. A → B → C). |
| **Router** | Conditional edges; route to different nodes by LLM or logic. | Branching by intent, topic, or tool choice. |
| **Agent** | ReAct-style agent: LLM + tools, loop until finish. | When the flow must decide which tools to call and in what order. |
| **Agent memory** | In-memory message history (`add_messages`) in state. | Single-session agents that need conversation context. |

---

## State & memory

| Capability | What it does | When to use |
|------------|--------------|-------------|
| **State schema** | Typed state (TypedDict), channels, annotations. | Any graph; keeps state explicit and type-safe. |
| **State reducers** | Custom reducers (e.g. `add_messages`, append, merge). | Accumulating messages or lists without overwriting. |
| **Multiple schemas** | Different state shapes for different subgraphs or paths. | Complex flows where subgraphs need different state. |
| **Trim/filter messages** | Sliding window, token limit, or filter by role. | Long conversations; avoid context overflow and control cost. |
| **Chatbot summarization** | Summarize older messages, keep recent + summary in state. | Long-running chats with bounded context and cost. |
| **External memory** | Persist chat state (e.g. Redis) across sessions. | Multi-session agents; resume and recall across threads. |

---

## Human-in-the-loop & control flow

| Capability | What it does | When to use |
|------------|--------------|-------------|
| **Breakpoints** | `interrupt()` before a node; graph pauses for input. | Approval steps, confirmations, or human decisions. |
| **Dynamic breakpoints** | Conditional `interrupt()` based on state or policy. | When only some runs need human approval. |
| **Edit state / feedback** | Resume with updated state (e.g. user corrections). | Let users fix or override agent output before continuing. |
| **Time travel** | Checkpointing and rewind to a prior state. | Debugging, replay, or "undo last step" in a run. |

---

## Advanced orchestration

| Capability | What it does | When to use |
|------------|--------------|-------------|
| **Map-reduce** | Map over items (e.g. chunks, list), then reduce. | Summarizing many documents, batch processing, fan-out then merge. |
| **Parallelization** | Run multiple nodes or branches in parallel. | Independent sub-tasks (e.g. multiple tools or API calls). |
| **Sub-graph** | Compose a `StateGraph` as a node inside a parent graph. | Reusable workflows (e.g. "research" or "review" sub-flow). |
| **Research assistant** | Multi-step: plan → search → synthesize. | Question answering, research, or evidence-gathering flows. |

---

## Persistent & semantic memory

| Capability | What it does | When to use |
|------------|--------------|-------------|
| **Memory store** | Persistent store (e.g. vector store) for facts/entities. | Long-term user or domain memory; RAG over past interactions. |
| **Memory schema (profile)** | User/entity profiles (structured facts) in memory. | Personalization, preferences, or user-specific context. |
| **Memory agent** | Agent that reads/writes persistent memory. | Agents that "remember" and use stored facts. |

---

## Quick selection guide

- **Linear pipeline** → Chain or simple graph
- **Branching by intent/tool** → Router or Agent
- **Conversation context** → Agent memory; long context → trim/filter or summarization
- **Cross-session memory** → External memory or Memory store
- **Human approval/correction** → Breakpoints, edit state
- **Batch / many items** → Map-reduce or parallelization
- **Reusable sub-workflow** → Sub-graph
- **Research / search + synthesize** → Research assistant pattern
- **Platinum production** → See `.claude/instructions/langgraph-enterprise-standards.md`