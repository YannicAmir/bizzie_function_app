import json
import logging
import time
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.cache import hash_query
from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.nodes.circuit_breaker import _get_thread_id
from src.features.bizzie_chat.agent.prompts.shared import _format_history, extract_text_content
from src.features.bizzie_chat.agent.prompts.tavily_prompts import build_tavily_system
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import get_tavily_tool, strip_unsupported_keys

logger = logging.getLogger(__name__)


def _build_search_query(
    query: str,
    company_name: str,
    company_ticker: str,
    references_different: bool,
    referenced_ticker: str | None,
) -> str:
    current_date = time.strftime("%B %d, %Y")
    context = referenced_ticker if (references_different and referenced_ticker) else company_ticker
    return f"{query} {company_name} {context} today {current_date}"


def _sanitize_tavily_tool(tool: Any) -> Any:
    if hasattr(tool, "args"):
        args = tool.args.copy()
        strip_unsupported_keys(args)
        return tool.model_copy(update={"args": args})
    return tool


async def _run_tool_call_loop(
    llm_with_tavily: Any,
    tavily_tool: Any,
    messages: list[Any],
    thread_id: str,
) -> Any:
    response: Any = None
    for cycle in range(2):
        response = await llm_with_tavily.ainvoke(messages)
        logger.info(
            f"tavily_fallback_agent: AI response (cycle {cycle + 1})",
            extra={"json_fields": {
                "node": "tavily_fallback_agent",
                "thread_id": thread_id,
                "finish_reason": (
                    response.response_metadata.get("finish_reason")
                    if hasattr(response, "response_metadata")
                    else "unknown"
                ),
            }},
        )
        messages.append(response)

        if not response.tool_calls:
            break

        for tool_call in response.tool_calls:
            tool_call_id = tool_call.get("id", f"tavily_{cycle}")
            try:
                result = await tavily_tool.ainvoke(tool_call.get("args", {}))
                messages.append(ToolMessage(content=json.dumps(result), tool_call_id=tool_call_id))
            except Exception as t_exc:
                messages.append(ToolMessage(content=f"Search error: {str(t_exc)}", tool_call_id=tool_call_id))

    return response


async def tavily_fallback_agent(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    company_ticker = state["company_ticker"]
    company_name = state["company_name"]
    references_different = state.get("references_different_company", False)
    referenced_ticker = state.get("referenced_ticker")
    experience = state.get("investing_experience", "intermediate")

    logger.info(
        "tavily_fallback_agent: start",
        extra={"json_fields": {"node": "tavily_fallback_agent", "thread_id": thread_id, "ticker": company_ticker}},
    )

    search_query = _build_search_query(
        state["query"], company_name, company_ticker, references_different, referenced_ticker
    )

    try:
        tavily_tool = _sanitize_tavily_tool(get_tavily_tool())

        llm = ChatGoogleGenerativeAI(
            model=state.get("model_flash") or config.model_flash,
            project=config.gcp_project,
            location=config.gcp_location,
            base_url=config.vertex_api_endpoint,
            safety_settings={
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            },
        )
        llm_with_tavily = llm.bind_tools([tavily_tool]).with_config(tags=["final_response"])

        system_content = build_tavily_system(
            company_name, company_ticker, experience, references_different, referenced_ticker
        )
        history_text = _format_history(state.get("conversation_history", []))
        messages: list[Any] = [SystemMessage(content=system_content)]
        if history_text:
            messages.append(SystemMessage(content=history_text))
        messages.append(HumanMessage(content=search_query))

        response = await _run_tool_call_loop(llm_with_tavily, tavily_tool, messages, thread_id)
        raw_response = extract_text_content(response)
        metadata = dict(state.get("metadata") or {})
        metadata["fallback_source"] = "tavily"

        logger.info(
            "tavily_fallback_agent: complete",
            extra={"json_fields": {"node": "tavily_fallback_agent", "thread_id": thread_id}},
        )

        return {
            "tavily_result": raw_response,
            "raw_response": raw_response,
            "tavily_error": None,
            "route_path": "fallback",
            "source": "tavily",
            "metadata": metadata,
        }

    except Exception as exc:
        logger.error(
            "tavily_fallback_agent: error",
            extra={"json_fields": {"node": "tavily_fallback_agent", "thread_id": thread_id, "error": str(exc)}},
        )
        metadata = dict(state.get("metadata") or {})
        metadata["fallback_source"] = "tavily"
        return {
            "tavily_result": None,
            "tavily_error": str(exc),
            "raw_response": None,
            "metadata": metadata,
        }


async def error_response_node(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    query_hash = hash_query(state.get("query", ""))

    logger.error(
        "error_response_node: both data sources failed",
        extra={"json_fields": {
            "node": "error_response_node",
            "thread_id": thread_id,
            "session_id": state.get("session_id"),
            "company_ticker": state.get("company_ticker"),
            "query_hash": query_hash,
            "fmp_error": state.get("fmp_error"),
            "tavily_error": state.get("tavily_error"),
        }},
    )

    return {
        "final_response": (
            "Our market data sources are temporarily unavailable right now. "
            "Your question requires live data — please try again in a few minutes."
        ),
        "route_path": "error",
        "source": "error",
        "retry_after_seconds": 120,
        "follow_ups": [],
    }
