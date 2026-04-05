"""StateGraph wiring for the bizzie_chat LangGraph service."""

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
    price_redirect_agent,
    response_assembler,
    response_sanitizer,
    stock_query_circuit_breaker_check,
    tavily_fallback_agent,
)
from src.features.bizzie_chat.agent.state import BizzieState

logger = logging.getLogger(__name__)


def route_after_guardian(
    state: BizzieState,
) -> Literal[
    "exit_agent", "price_redirect_agent", "doc_summary_node",
    "ambassador_circuit_breaker_check", "stock_query_circuit_breaker_check", "error_response_node"
]:
    """Route after guardian_classifier based on classification."""
    route = state.get("route_path")
    if route == "exit":
        return "exit_agent"
    if route == "price_redirect":
        return "price_redirect_agent"
    if route == "doc_summary":
        return "doc_summary_node"
    if route == "ambassador":
        return "ambassador_circuit_breaker_check"
    if route == "error":
        return "error_response_node"
    return "stock_query_circuit_breaker_check"


def route_after_ambassador_cb(
    state: BizzieState,
) -> Literal["ambassador_fmp_call", "ambassador_llm_node"]:
    """Route after ambassador circuit breaker check."""
    if state.get("fmp_available", True):
        return "ambassador_fmp_call"
    return "ambassador_llm_node"


def route_after_stock_cb(
    state: BizzieState,
) -> Literal["fmp_agent", "tavily_fallback_agent"]:
    """Route after stock query circuit breaker check."""
    if state.get("fmp_available", True):
        return "fmp_agent"
    return "tavily_fallback_agent"


def route_after_fmp_agent(
    state: BizzieState,
) -> list[str] | str:
    """Route after fmp_agent — handles fallback or parallel fan-out."""
    if state.get("fmp_error"):
        return "tavily_fallback_agent"
    return ["response_sanitizer", "follow_up_generator"]


def route_after_ambassador_llm(
    state: BizzieState,
) -> list[str]:
    return ["response_sanitizer", "follow_up_generator"]


def route_after_doc_summary(
    state: BizzieState,
) -> list[str]:
    return ["response_sanitizer", "follow_up_generator"]


def route_after_tavily(
    state: BizzieState,
) -> list[str]:
    return ["response_sanitizer", "follow_up_generator"]


def build_graph(checkpointer=None) -> CompiledStateGraph:
    """Assemble and compile the bizzie_chat StateGraph."""
    builder = StateGraph(BizzieState)

    builder.add_node("guardian_classifier", guardian_classifier)
    builder.add_node("exit_agent", exit_agent)
    builder.add_node("price_redirect_agent", price_redirect_agent)
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

    builder.add_edge(START, "guardian_classifier")

    builder.add_conditional_edges(
        "guardian_classifier",
        route_after_guardian,
        {
            "exit_agent": "exit_agent",
            "price_redirect_agent": "price_redirect_agent",
            "doc_summary_node": "doc_summary_node",
            "ambassador_circuit_breaker_check": "ambassador_circuit_breaker_check",
            "stock_query_circuit_breaker_check": "stock_query_circuit_breaker_check",
            "error_response_node": "error_response_node",
        },
    )

    builder.add_edge("exit_agent", END)
    builder.add_edge("price_redirect_agent", END)
    builder.add_edge("error_response_node", END)

    builder.add_conditional_edges(
        "ambassador_circuit_breaker_check",
        route_after_ambassador_cb,
        {
            "ambassador_fmp_call": "ambassador_fmp_call",
            "ambassador_llm_node": "ambassador_llm_node",
        },
    )
    builder.add_edge("ambassador_fmp_call", "ambassador_llm_node")
    builder.add_conditional_edges(
        "ambassador_llm_node",
        route_after_ambassador_llm,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    builder.add_conditional_edges(
        "doc_summary_node",
        route_after_doc_summary,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

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

    builder.add_conditional_edges(
        "tavily_fallback_agent",
        route_after_tavily,
        {
            "response_sanitizer": "response_sanitizer",
            "follow_up_generator": "follow_up_generator",
        },
    )

    builder.add_edge("response_sanitizer", "response_assembler")
    builder.add_edge("follow_up_generator", "response_assembler")
    builder.add_edge("response_assembler", END)

    compiled = builder.compile(checkpointer=checkpointer)
    logger.info("bizzie_chat graph compiled", extra={"json_fields": {"checkpointer": type(checkpointer).__name__}})
    return compiled


def make_checkpointer():
    """Create the checkpointer instance."""
    if config.env == "local":
        return MemorySaver()
    try:
        from langgraph.checkpoint.redis.aio import AsyncRedisSaver
        return AsyncRedisSaver(redis_url=config.redis_url)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Redis checkpointer init failed — falling back to MemorySaver",
            extra={"json_fields": {"error": str(exc)}},
        )
        return MemorySaver()


graph = build_graph(None)
