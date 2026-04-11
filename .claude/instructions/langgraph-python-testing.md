# Python LangGraph — Testing & Production Checklist

Testing patterns and production readiness checklist for LangGraph services. Follows the same Arrange-Act-Assert convention as the TypeScript test suite.

---

## Node Unit Tests

```python
# tests/test_nodes.py
import pytest
from unittest.mock import AsyncMock, patch
from src.agent.nodes import classify_node

@pytest.mark.asyncio
async def test_classifyNode_success_returnsCategory():
    # Arrange
    state = {"messages": [...], "user_id": "u1", "result": None, "error": None}
    mock_response = AsyncMock()
    mock_response.content = "CATEGORY_A"

    # Act
    with patch("src.agent.nodes.llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)
        result = await classify_node(state)

    # Assert
    assert result == {"result": "CATEGORY_A"}

@pytest.mark.asyncio
async def test_classifyNode_llmFailure_setsError():
    # Arrange
    state = {"messages": [...], "user_id": "u1", "result": None, "error": None}

    # Act
    with patch("src.agent.nodes.llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(side_effect=Exception("LLM unavailable"))
        result = await classify_node(state)

    # Assert
    assert result.get("error") is not None
```

**Conventions:**
- File: `tests/test_[module].py`
- Name: `test_[unit]_[scenario]_[expected]`
- Always test both success and failure paths per node.
- Mock `llm.ainvoke` at the module level, not at the LangChain Runnable layer.

---

## Graph Integration Tests

```python
from langgraph.checkpoint.memory import MemorySaver
from src.agent.graph import build_graph

@pytest.mark.asyncio
async def test_fullGraph_happyPath_returnsResult():
    # Arrange
    graph = build_graph(MemorySaver())
    input_state = {"messages": [...], "user_id": "u1", "result": None, "error": None}

    # Act
    result = await graph.ainvoke(
        input_state,
        config={"configurable": {"thread_id": "test-thread-1"}},
    )

    # Assert
    assert result["error"] is None
    assert result["result"] is not None
```

Use `MemorySaver` — never real Postgres/Redis in tests.

---

## Interrupt/Resume Tests (if `interrupt()` is used)

```python
@pytest.mark.asyncio
async def test_graph_interruptResume_continuesAfterApproval():
    graph = build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "test-interrupt-1"}}

    # Act — invoke until interrupt
    result = await graph.ainvoke(input_state, config=config)
    # Assert — graph paused
    assert result["status"] == "awaiting_approval"

    # Act — resume with approval
    result = await graph.ainvoke(Command(resume="approved"), config=config)
    # Assert — continued
    assert result["status"] == "complete"
```

---

## Checkpointer Persistence Test

```python
@pytest.mark.asyncio
async def test_graph_checkpointerPersistence_resumesAfterRestart():
    checkpointer = PostgresSaver.from_conn_string(TEST_POSTGRES_URI)
    graph = build_graph(checkpointer)
    thread_config = {"configurable": {"thread_id": "persist-test-1"}}

    # Run partial graph
    await graph.ainvoke(partial_input, config=thread_config)

    # Simulate restart — new graph instance, same checkpointer
    graph2 = build_graph(checkpointer)
    result = await graph2.ainvoke(None, config=thread_config)

    assert result["result"] is not None
```

---

## Production Readiness Checklist

Before shipping any LangGraph service to production:

- [ ] Venv with pinned `requirements.txt`
- [ ] `TypedDict` state, pure async nodes
- [ ] `MemorySaver` replaced with Redis or Postgres checkpointer + TTL configured
- [ ] `recursion_limit` set for any cyclic graph
- [ ] LangSmith tracing enabled and traces verified
- [ ] Unit tests for every node (success + failure)
- [ ] Graph integration test with `MemorySaver`
- [ ] Interrupt/resume tested if `interrupt()` is used
- [ ] Checkpointer persistence tested (stop → restart → resume same `thread_id`)
- [ ] Input/output guardrails applied where required
- [ ] `ruff`, `mypy`, `pytest` all passing
- [ ] Cost estimate documented in `.claude/docs/cost-estimates/`
- [ ] Cloud Function timeout > max graph execution time + buffer
- [ ] Monitoring in place (latency, token usage, error rate)