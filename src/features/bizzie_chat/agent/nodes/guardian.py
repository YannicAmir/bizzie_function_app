import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.cache import (
    cache_get,
    cache_set,
    guardian_cache_key,
    hash_query,
)
from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.nodes.circuit_breaker import _get_thread_id
from src.features.bizzie_chat.agent.prompts.guardian_prompts import (
    GUARDIAN_SYSTEM_PROMPT,
    build_guardian_user_content,
)
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import GUARDIAN_CLASSIFIER_TOOL

logger = logging.getLogger(__name__)


def _extract_classification(response: Any, thread_id: str) -> dict[str, Any]:
    if response.tool_calls:
        return response.tool_calls[0].get("args", {})
    logger.warning(
        "guardian_classifier: no tool_call in response, defaulting to stock_query",
        extra={"json_fields": {"node": "guardian_classifier", "thread_id": thread_id}},
    )
    return {
        "non_stock_related": False,
        "requesting_investment_advice": False,
        "requesting_doc_summary": False,
        "references_different_company": False,
    }


def _resolve_route(classification: dict[str, Any]) -> str:
    if classification.get("requesting_doc_summary"):
        return "doc_summary"
    if classification.get("requesting_investment_advice"):
        return "ambassador"
    if classification.get("non_stock_related"):
        return "exit"
    if classification.get("is_price_only_query"):
        return "price_redirect"
    return "stock_query"


async def guardian_classifier(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    query_hash = hash_query(state["query"])
    logger.info(
        "guardian_classifier: start",
        extra={"json_fields": {"node": "guardian_classifier", "thread_id": thread_id, "query_hash": query_hash}},
    )

    cache_key = guardian_cache_key(query_hash, state["company_ticker"])
    cached_result = await cache_get(cache_key)
    if cached_result is not None:
        logger.info(
            "guardian_classifier: cache hit",
            extra={"json_fields": {"node": "guardian_classifier", "thread_id": thread_id, "query_hash": query_hash}},
        )
        return cached_result

    try:
        llm = ChatGoogleGenerativeAI(
            model=state.get("model_flash_lite") or config.model_flash_lite,
            project=config.gcp_project,
            location=config.gcp_location,
            base_url=config.vertex_api_endpoint,
            max_tokens=config.max_tokens_guardian,
            safety_settings={
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            },
        )
        llm_with_tools = llm.bind_tools([GUARDIAN_CLASSIFIER_TOOL.copy()], tool_choice=True)

        response = await llm_with_tools.ainvoke([
            SystemMessage(content=GUARDIAN_SYSTEM_PROMPT),
            HumanMessage(content=build_guardian_user_content(
                state["company_name"], state["company_ticker"], state["query"]
            )),
        ])

        classification = _extract_classification(response, thread_id)
        route_path = _resolve_route(classification)

        references_different = bool(classification.get("references_different_company", False))
        referenced_ticker = classification.get("referenced_ticker") or None
        required_cats = classification.get("required_data_categories") or []
        deep_reasoning = bool(classification.get("requires_deep_reasoning", False))
        is_price_only = bool(classification.get("is_price_only_query", False))

        logger.info(
            "guardian_classifier: complete",
            extra={"json_fields": {
                "node": "guardian_classifier",
                "thread_id": thread_id,
                "route_path": route_path,
                "references_different_company": references_different,
                "required_data_categories": required_cats,
                "requires_deep_reasoning": deep_reasoning,
                "finish_reason": (
                    response.response_metadata.get("finish_reason")
                    if hasattr(response, "response_metadata")
                    else "unknown"
                ),
            }},
        )

        result = {
            "classification": classification,
            "route_path": route_path,
            "references_different_company": references_different,
            "referenced_ticker": referenced_ticker,
            "comparison_mode": references_different,
            "required_data_categories": required_cats,
            "requires_deep_reasoning": deep_reasoning,
            "is_price_only_query": is_price_only,
        }
        await cache_set(cache_key, result, 3600)
        return result

    except Exception as exc:
        logger.error(
            "guardian_classifier: error",
            extra={"json_fields": {"node": "guardian_classifier", "thread_id": thread_id, "error": str(exc)}},
        )
        return {
            "classification": {},
            "route_path": "stock_query",
            "references_different_company": False,
            "referenced_ticker": None,
            "comparison_mode": False,
        }


async def exit_agent(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    logger.info(
        "exit_agent: serving static response",
        extra={"json_fields": {"node": "exit_agent", "thread_id": thread_id}},
    )
    return {
        "final_response": (
            "I'm Bizzie's stock market assistant — I can help with questions about "
            f"{state['company_name']} and other companies. What would you like to know?"
        ),
        "route_path": "exit",
        "source": "static",
        "follow_ups": [],
    }


async def price_redirect_agent(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    logger.info(
        "price_redirect_agent: serving static redirect",
        extra={"json_fields": {"node": "price_redirect_agent", "thread_id": thread_id}},
    )
    return {
        "final_response": (
            f"The stock price is displayed on {state['company_name']}'s Security tab. Check it out!"
        ),
        "route_path": "price_redirect",
        "source": "static",
        "follow_ups": [],
    }
