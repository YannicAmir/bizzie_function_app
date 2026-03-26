"""
Tavily fallback and error nodes.

tavily_fallback_agent: LLM + Tavily web search, used when FMP is unavailable.
error_response_node: Static response when both FMP and Tavily have failed.
"""

import json
import logging
import time
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import get_tavily_tool, strip_unsupported_keys
from src.features.bizzie_chat.agent.nodes.circuit_breaker import _get_thread_id
from src.features.bizzie_chat.agent.nodes.ambassador import (
    _experience_instruction,
    _format_history,
    CONCISE_DIRECTIVE,
)
from src.features.bizzie_chat.agent.nodes.guardian import _hash_query

logger = logging.getLogger(__name__)


async def tavily_fallback_agent(state: BizzieState) -> dict[str, Any]:
    """LLM + Tavily web search fallback for when FMP fails or circuit breaker is open."""
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

    current_date = time.strftime("%B %d, %Y")
    if references_different and referenced_ticker:
        search_query = f"{state['query']} {company_name} {referenced_ticker} today {current_date}"
    else:
        search_query = f"{state['query']} {company_name} {company_ticker} today {current_date}"

    try:
        tavily_tool = get_tavily_tool()

        if hasattr(tavily_tool, "args"):
            _t_args = tavily_tool.args.copy()
            strip_unsupported_keys(_t_args)
            tavily_tool = tavily_tool.model_copy(update={"args": _t_args})

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
        llm_with_tavily = llm.bind_tools([tavily_tool])

        if references_different and referenced_ticker:
            system_content = (
                CONCISE_DIRECTIVE +
                f"You are a financial assistant. The user is viewing {company_name} ({company_ticker}). "
                f"They are asking about {referenced_ticker}. Treat this as a comparison. "
                "Use Tavily to search for relevant information. "
                "Structure: (1) briefly answer about the referenced company, (2) pivot to the current company. "
                "Always end with: 'Note: this data is sourced from web search and may not reflect real-time figures.' "
                f"\n\n{_experience_instruction(experience)}"
            )
        else:
            system_content = (
                CONCISE_DIRECTIVE +
                f"You are a financial assistant. The user is asking about {company_name} ({company_ticker}). "
                "Use Tavily to search for the most current relevant information. "
                "Always end with: 'Note: this data is sourced from web search and may not reflect real-time figures.' "
                f"\n\n{_experience_instruction(experience)}"
            )

        history_text = _format_history(state.get("conversation_history", []))
        messages: list[Any] = [SystemMessage(content=system_content)]
        if history_text:
            messages.append(SystemMessage(content=history_text))
        messages.append(HumanMessage(content=search_query))

        for cycle in range(2):
            response = await llm_with_tavily.ainvoke(messages)
            logger.info(
                f"tavily_fallback_agent: AI response (cycle {cycle+1})",
                extra={
                    "json_fields": {
                        "node": "tavily_fallback_agent",
                        "thread_id": thread_id,
                        "finish_reason": (response.response_metadata.get("finish_reason") if hasattr(response, "response_metadata") else "unknown"),
                    }
                },
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

        if isinstance(response.content, str):
            raw_response = response.content
        elif isinstance(response.content, list):
            raw_response = "".join([p.get("text", "") if isinstance(p, dict) else str(p) for p in response.content])
        else:
            raw_response = str(response.content)

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
    """
    Static error response when both FMP and Tavily have failed.
    Logs structured error to Cloud Logging. Does NOT count against rate limit.
    Does NOT trigger Firestore conversation write.
    """
    thread_id = _get_thread_id(state)
    query_hash = _hash_query(state.get("query", ""))

    logger.error(
        "error_response_node: both data sources failed",
        extra={
            "json_fields": {
                "node": "error_response_node",
                "thread_id": thread_id,
                "session_id": state.get("session_id"),
                "company_ticker": state.get("company_ticker"),
                "query_hash": query_hash,
                "fmp_error": state.get("fmp_error"),
                "tavily_error": state.get("tavily_error"),
            }
        },
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
