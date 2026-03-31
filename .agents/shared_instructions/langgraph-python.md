---
name: LangGraph Python Patterns
description: Core implementation patterns for LangGraph services using Python, ChatVertexAI, and TypedDict.
---

# LangGraph Python Patterns

Core patterns for implementing LangGraph services in the Bizzie stack.

---

## 1. State Pattern (TypedDict)

Always use `TypedDict` for graph state. Avoid Pydantic for state as it re-validates on every node, which is expensive and breaks partial updates.

```python
from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    messages: Annotated[List[dict], add_messages]  # Accumulator
    context: dict
    result: Optional[str]
    error: Optional[str]
```

---

## 2. Node Implementation (Pure & Async)

Nodes must be `async`, pure, and return partial dicts.

```python
# ✅ partial update, async, typed
async def analyzer_node(state: AgentState) -> dict:
    response = await llm.ainvoke(state["messages"])
    return {"result": response.content}
```

---

## 3. Vertex AI (Gemini) Configuration

Use `ChatVertexAI` from `langchain-google-vertexai`.

```python
from langchain_google_vertexai import ChatVertexAI

llm = ChatVertexAI(
    model_name="gemini-1.5-flash",
    project=os.environ["GCLOUD_PROJECT"],
    location="us-central1",
    max_retries=3,
)
```

---

## 4. Graph Construction & serving

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

def get_graph(checkpointer):
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.set_entry_point("agent")
    workflow.add_edge("agent", END)
    return workflow.compile(checkpointer=checkpointer)

# Serving with FastAPI
from fastapi import FastAPI
app = FastAPI()

@app.post("/invoke")
async def invoke(req: InvokeRequest):
    return await graph.ainvoke(
        req.input,
        config={"configurable": {"thread_id": req.thread_id}}
    )
```

---

## 5. Core Checklist

- [ ] Python 3.11+ used.
- [ ] `TypedDict` used for graph state.
- [ ] Nodes are `async` and return partial updates.
- [ ] `ChatVertexAI` configured with environment variables.
- [ ] Structured logging using `google-cloud-logging` implemented.
- [ ] Exact dependencies pinned in `requirements.txt`.
- [ ] `recursion_limit` passed in all ainvoke calls.
- [ ] No secrets in logs or state.
- [ ] Idempotent side effects.
