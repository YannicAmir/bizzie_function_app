# Python LangGraph — Core Patterns

Core implementation patterns for LangGraph services in the Bizzie stack. See also:
- `.claude/instructions/langgraph-python-setup.md` — project structure, deps, deployment
- `.claude/instructions/langgraph-python-testing.md` — testing patterns and production checklist

---

## Python Version
- **Python 3.11+** minimum. 3.12 preferred for new services.
- Base image: `python:3.11-slim` in Dockerfiles.

---

## State: TypedDict (never Pydantic BaseModel)

**Always use `TypedDict` for graph state.** Pydantic re-validates on every node execution, breaking partial update semantics and degrading performance.

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]  # reducer for accumulation
    user_id: str
    result: str | None
    error: str | None

# Pydantic only at HTTP boundaries
from pydantic import BaseModel
class InvokeRequest(BaseModel):
    input: dict
    thread_id: str
    config: dict | None = None
```

Reducer rules: `add_messages` for accumulation; plain assignment for scalar/replace fields.

---

## Node Functions

```python
# ✅ partial update, async, typed
async def classify_node(state: AgentState) -> dict:
    response = await llm.ainvoke(state["messages"])
    return {"result": response.content}  # only changed keys

# ❌ never mutate or return full state
async def bad_node(state: AgentState) -> AgentState:
    state["result"] = "value"  # forbidden
    return state
```

- Always **async** in Cloud Run + FastAPI.
- Return **partial dicts** — only keys this node changes.
- **Pure** — no hidden global mutable state.
- Validate only at graph entry, not inside every node.

---

## LangGraph + Google Vertex AI (Gemini)

```python
from langchain_google_vertexai import ChatVertexAI

llm = ChatVertexAI(
    model_name=config.model_name,        # from env/config — never hardcode
    project=os.environ["GCLOUD_PROJECT"],
    location="us-central1",
    max_retries=3,                        # HTTP-layer retries (429, 500, 503)
)
response = await llm.ainvoke(messages)   # always ainvoke in async context
```

**`config.py` pattern:**
```python
from dataclasses import dataclass
import os

@dataclass(frozen=True)
class LangGraphConfig:
    model_name: str = os.environ.get("LLM_MODEL", "gemini-1.5-flash")
    max_steps: int = int(os.environ.get("MAX_STEPS", "10"))
    project: str = os.environ.get("GCLOUD_PROJECT", "")
    location: str = os.environ.get("GCP_LOCATION", "us-central1")

config = LangGraphConfig()
```

---

## Graph Compilation & Checkpointing

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver  # production
from langgraph.checkpoint.memory import MemorySaver      # local/tests only

def build_graph(checkpointer=None):
    workflow = StateGraph(AgentState)
    workflow.add_node("classify", classify_node)
    workflow.add_node("generate", generate_node)
    workflow.set_entry_point("classify")
    workflow.add_edge("classify", "generate")
    workflow.add_edge("generate", END)
    return workflow.compile(checkpointer=checkpointer)

graph = build_graph(
    MemorySaver() if os.environ.get("ENV") == "local"
    else PostgresSaver.from_conn_string(os.environ["POSTGRES_URI"])
)

# Invoke with recursion_limit
result = await graph.ainvoke(
    input_state,
    config={"configurable": {"thread_id": thread_id}, "recursion_limit": config.max_steps},
)
```

---

## Error Handling & Retry (3 layers)

```python
# Layer 1 — HTTP retries on the LLM client
llm = ChatVertexAI(model_name=config.model_name, max_retries=3)

# Layer 2 — Node-level RetryPolicy
from langgraph.types import RetryPolicy
workflow.add_node(
    "llm_call", llm_node,
    retry=RetryPolicy(max_attempts=3, initial_interval=1.0, backoff_factor=2.0),
)

# Layer 3 — Conditional edge to error handler
def route_on_error(state: AgentState) -> str:
    return "error_handler" if state.get("error") else "next_node"

workflow.add_conditional_edges("llm_call", route_on_error)
```

---

## Structured Logging (Cloud Run)

```python
# main.py — once at startup
import google.cloud.logging
google.cloud.logging.Client().setup_logging()

# each module
import logging
logger = logging.getLogger(__name__)

logger.info("Node executed", extra={"json_fields": {
    "node": "classify", "thread_id": thread_id, "tokens_used": n,
}})
```

- `logging.getLogger(__name__)` — one named logger per module.
- Never log secrets, API keys, PII, or full message payloads.
- Always include `thread_id` and `node` in structured fields.

---

## Quick Reference

| Concern | Choice |
|---|---|
| State type | `TypedDict` (never Pydantic for state) |
| HTTP boundaries | Pydantic v2 `BaseModel` |
| Checkpointer (local/tests) | `MemorySaver` |
| Checkpointer (production) | `PostgresSaver` or `RedisSaver` |
| LLM client | `ChatVertexAI` from `langchain-google-vertexai` |
| Async | Always `ainvoke` / `astream` in Cloud Run |
| Logging | `google-cloud-logging` v3 + `logging.getLogger(__name__)` |
| Linting | `ruff` |
| Type checking | `mypy --strict` |
| Testing | `pytest` + `pytest-asyncio` + mock `llm.ainvoke` |
| Dependencies | Exact versions pinned in `requirements.txt` |