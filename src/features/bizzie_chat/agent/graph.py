"""
StateGraph wiring for the bizzie_chat LangGraph service.

Topology (simplified):
  START
    └─ guardian_classifier
         ├─ exit       → exit_agent ──────────────────────────────────────────► END
         ├─ doc_summary → doc_summary_node ──────────────────────────────────┐
         ├─ ambassador  → ambassador_circuit_breaker_check                   │
         │                   ├─ (open)  → ambassador_llm_node ───────────────┤
         │                   └─ (closed)→ ambassador_fmp_call                │
         │                                  └─ ambassador_llm_node ──────────┤
         ├─ fmp         → stock_query_circuit_breaker_check                  │
         │                   ├─ (open)  → tavily_fallback_agent ─────────────┤
         │                   └─ (closed)→ fmp_agent                          │
         │                                  ├─ (error) → tavily_fallback     ┤
         │                                  └─ (ok)   ─► response_sanitizer  │  (parallel)
         │                                              ─► follow_up_generator┤
         └─ error       → error_response_node ────────────────────────────► END

  response_sanitizer  ─┐
  follow_up_generator  ─┴─► response_assembler ──────────────────────────► END
"""

import logging
from typing import Literal

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.nodes import (
    ambassador_circuit_breaker_check,
    ambassador_fmp_call,
    ambassador_llm_node,
    doc_summary_node,
    error_response_node,
    exit_agent,
    fmp_agent,
    follow_up_generator,
    guardian_classifier,
    response_assembler,
    response_sanitizer,
    stock_query_circuit_breaker_check,
    tavily_fallback_agent,
)
from src.features.bizzie_chat.agent.state import BizzieState

logger = logging.getLogger(__name__)

# ── Routing functions ──────────────────────────────────────────────────────────


def route_after_guardian(
    state: BizzieState,
) -> Literal["exit_agent", "doc_summary_node", "ambassador_circuit_breaker_check", "stock_query_circuit_breaker_check", "error_response_node"]:
    """Route after guardian_classifier based on classification + route_path."""
    route = state.get("route_path")
    if route == "exit":
        return "exit_agent"
    if route == "doc_summary":
        return "doc_summary_node"
    if route == "ambassador":
        return "ambassador_circuit_breaker_check"
    if route == "error":
        return "error_response_node"
    # Default: stock FMP path (route == "fmp" or anything else)
    return "stock_query_circuit_breaker_check"


def route_after_ambassador_cb(
    state: BizzieState,
) -> Literal["ambassador_fmp_call", "ambassador_llm_node"]:
    """
    After ambassador circuit breaker check:
    - circuit open (fmp_available=False)  → skip FMP fetch, go straight to LLM
    - circuit closed (fmp_available=True) → fetch company profile from FMP first
    """
    if state.get("fmp_available", True):
        return "ambassador_fmp_call"
    return "ambassador_llm_node"


def route_after_stock_cb(
    state: BizzieState,
) -> Literal["fmp_agent", "tavily_fallback_agent"]:
    """
    After stock query circuit breaker check:
    - circuit open (fmp_available=False) → skip FMP, use Tavily
    - circuit closed (fmp_available=True) → use FMP agent
    """
    if state.get("fmp_available", True):
        return "fmp_agent"
    return "tavily_fallback_agent"


def route_after_fmp_agent(
    state: BizzieState,
) -> list[str] | str:
    """
    After fmp_agent:
    - FMP failed → fall back to Tavily
    - FMP succeeded → parallel fan-out to sanitizer + follow-up generator
    """
    if state.get("fmp_error"):
        return "tavily_fallback_agent"
    return ["response_sanitizer", "follow_up_generator"]


def route_after_ambassador_llm(
    state: BizzieState,
) -> list[str]:
    """Ambassador LLM always fans out to sanitizer + follow-up generator."""
    return ["response_sanitizer", "follow_up_generator"]


def route_after_doc_summary(
    state: BizzieState,
) -> list[str]:
    """Doc summary always fans out to sanitizer + follow-up generator."""
    return ["response_sanitizer", "follow_up_generator"]


def route_after_tavily(
    state: BizzieState,
) -> list[str]:
    """Tavily always fans out to sanitizer + follow-up generator (even on error)."""
    return ["response_sanitizer", "follow_up_generator"]


# ── Graph builder ─────────────────────────────────────────────────────────────


def build_graph(checkpointer=None) -> CompiledStateGraph:
    """
    Assemble and compile the bizzie_chat StateGraph.

    Args:
        checkpointer: LangGraph checkpointer (MemorySaver for local/tests,
                      AsyncRedisSaver for production).

    Returns:
        Compiled LangGraph graph ready for ainvoke().
    """
    builder = StateGraph(BizzieState)

    # ── Register all nodes ────────────────────────────────────────────────────
    builder.add_node("guardian_classifier", guardian_classifier)
    builder.add_node("exit_agent", exit_agent)
    builder.add_node("doc_summary_node", doc_summary_node)
    builder.add_node("ambassador_circuit_breaker_check", ambassador_circuit_breaker_check)
    builder.add_node("ambassador_fmp_call", ambassador_fmp_call)
    builder.add_node("ambassador_llm_node", ambassador_llm_node)
    builder.add_node("stock_query_circuit_breaker_check", stock_query_circuit_breaker_check)
    builder.add_node("fmp_agent", fmp_agent)
    builder.add_node("tavily_fallback_agent", tavily_fallback_agent)
    builder.add_node("error_response_node", error_response_node)
    builder.add_node("response_sanitizer", response_sanitizer)
    builder.add_node("follow_up_generator", follow_up_generator)
    builder.add_node("response_assembler", response_assembler)

    # ── Edges: entry ──────────────────────────────────────────────────────────
    builder.add_edge(START, "guardian_classifier")

    # ── Edges: guardian routing ───────────────────────────────────────────────
    builder.add_conditional_edges(
        "guardian_classifier",
        route_after_guardian,
        {
            "exit_agent": "exit_agent",
            "doc_summary_node": "doc_summary_node",
            "ambassador_circuit_breaker_check": "ambassador_circuit_breaker_check",
            "stock_query_circuit_breaker_check": "stock_query_circuit_breaker_check",
            "error_response_node": "error_response_node",
        },
    )

    # ── Edges: terminal paths ─────────────────────────────────────────────────
    builder.add_edge("exit_agent", END)
    builder.add_edge("error_response_node", END)

    # ── Edges: ambassador path ────────────────────────────────────────────────
    builder.add_conditional_edges(
        "ambassador_circuit_breaker_check",
        route_after_ambassador_cb,
        {
            "ambassador_fmp_call": "ambassador_fmp_call",
            "ambassador_llm_node": "ambassador_llm_node",
        },
    )
    # FMP profile fetch always flows into the LLM (FMP data may be partial/missing)
    builder.add_edge("ambassador_fmp_call", "ambassador_llm_node")
    builder.add_conditional_edges(
        "ambassador_llm_node",
        route_after_ambassador_llm,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    # ── Edges: doc summary path ───────────────────────────────────────────────
    builder.add_conditional_edges(
        "doc_summary_node",
        route_after_doc_summary,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    # ── Edges: stock query / FMP path ─────────────────────────────────────────
    builder.add_conditional_edges(
        "stock_query_circuit_breaker_check",
        route_after_stock_cb,
        {
            "fmp_agent": "fmp_agent",
            "tavily_fallback_agent": "tavily_fallback_agent",
        },
    )
    builder.add_conditional_edges(
        "fmp_agent",
        route_after_fmp_agent,
        {
            "tavily_fallback_agent": "tavily_fallback_agent",
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    # ── Edges: Tavily fallback path ───────────────────────────────────────────
    builder.add_conditional_edges(
        "tavily_fallback_agent",
        route_after_tavily,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    # ── Edges: fan-in to assembler ────────────────────────────────────────────
    builder.add_edge("response_sanitizer", "response_assembler")
    builder.add_edge("follow_up_generator", "response_assembler")
    builder.add_edge("response_assembler", END)

    compiled = builder.compile(checkpointer=checkpointer)
    logger.info("bizzie_chat graph compiled", extra={"json_fields": {"checkpointer": type(checkpointer).__name__}})
    return compiled


# ── Module-level graph instance ───────────────────────────────────────────────
# Imported by main.py. Checkpointer is selected at startup based on config.env.

def make_checkpointer():
    """
    Create the checkpointer instance.
    - local: MemorySaver (in-process, no Redis needed)
    - production: AsyncRedisSaver (call asetup() before serving requests)
    """
    if config.env == "local":
        logger.info("Using MemorySaver checkpointer (local mode)")
        return MemorySaver()
    try:
        from langgraph.checkpoint.redis.aio import AsyncRedisSaver
        checkpointer = AsyncRedisSaver(redis_url=config.redis_url)
        logger.info("Using AsyncRedisSaver checkpointer (production mode)")
        return checkpointer
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Redis checkpointer init failed — falling back to MemorySaver",
            extra={"json_fields": {"error": str(exc)}},
        )
        return MemorySaver()


# ── Module-level graph instance ───────────────────────────────────────────────
# Exported for LangGraph Studio and LangGraph CLI discovery.
# LangGraph Studio/API handles persistence automatically; do NOT pass a checkpointer here.
graph = build_graph(None)
