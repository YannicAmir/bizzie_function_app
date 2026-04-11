import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.nodes.circuit_breaker import (
    _get_thread_id,
    _read_circuit_breaker,
    _record_fmp_failure,
    _record_fmp_success,
)
from src.features.bizzie_chat.agent.prompts.ambassador_prompts import build_ambassador_prompt
from src.features.bizzie_chat.agent.prompts.shared import _format_history, extract_text_content
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import call_fmp_tool

logger = logging.getLogger(__name__)


async def _fetch_ticker_profile(ticker: str, thread_id: str) -> Any:
    last_error: Exception | None = None
    for attempt in range(config.fmp_retry_attempts + 1):
        try:
            return await call_fmp_tool("profile-symbol", {"symbol": ticker})
        except Exception as exc:
            last_error = exc
            if attempt < config.fmp_retry_attempts:
                logger.warning(
                    "ambassador_fmp_call: retrying after error",
                    extra={
                        "json_fields": {
                            "node": "ambassador_fmp_call",
                            "thread_id": thread_id,
                            "attempt": attempt + 1,
                            "ticker": ticker,
                        }
                    },
                )
    raise last_error  # type: ignore[misc]


async def ambassador_fmp_call(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    ticker = state["company_ticker"]
    logger.info(
        "ambassador_fmp_call: start",
        extra={"json_fields": {"node": "ambassador_fmp_call", "thread_id": thread_id, "ticker": ticker}},
    )

    cb_data: dict[str, Any] = {}
    try:
        cb_data = await _read_circuit_breaker()
    except Exception as exc:
        logger.warning(
            "ambassador_fmp_call: circuit breaker read failed, proceeding without cb state",
            extra={"json_fields": {"node": "ambassador_fmp_call", "error": str(exc)}},
        )

    tickers_to_fetch: list[str] = [ticker]
    referenced_ticker = state.get("referenced_ticker")
    if state.get("references_different_company") and referenced_ticker:
        referenced_ticker = referenced_ticker.replace(".", "-")
        if re.match(r"^[A-Z]{1,5}(-[A-Z]{1,2})?$", referenced_ticker):
            tickers_to_fetch.append(referenced_ticker)
        else:
            logger.warning(
                "ambassador_fmp_call: referenced_ticker failed format validation, skipping",
                extra={"json_fields": {"node": "ambassador_fmp_call", "thread_id": thread_id}},
            )

    profiles: dict[str, Any] = {}
    last_error: Exception | None = None
    for t in tickers_to_fetch:
        try:
            profiles[t] = await _fetch_ticker_profile(t, thread_id)
        except Exception as exc:
            last_error = exc

    metadata = dict(state.get("metadata") or {})
    metadata["fmp_attempted"] = True

    if profiles:
        await _record_fmp_success()
        logger.info(
            "ambassador_fmp_call: success",
            extra={
                "json_fields": {
                    "node": "ambassador_fmp_call",
                    "thread_id": thread_id,
                    "tickers_fetched": list(profiles.keys()),
                }
            },
        )
        return {"fmp_company_profile": profiles, "metadata": metadata}

    await _record_fmp_failure(cb_data)
    logger.error(
        "ambassador_fmp_call: all attempts failed",
        extra={
            "json_fields": {
                "node": "ambassador_fmp_call",
                "thread_id": thread_id,
                "error": str(last_error),
            }
        },
    )
    return {"fmp_company_profile": None, "metadata": metadata}


async def ambassador_llm_node(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    logger.info(
        "ambassador_llm_node: start",
        extra={"json_fields": {"node": "ambassador_llm_node", "thread_id": thread_id}},
    )

    fmp_profile = state.get("fmp_company_profile")
    has_fmp_data = bool(fmp_profile)
    content = build_ambassador_prompt(state, has_fmp_data, fmp_profile)

    try:
        llm = ChatGoogleGenerativeAI(
            model=state.get("model_flash") or config.model_flash,
            project=config.gcp_project,
            location=config.gcp_location,
            base_url=config.vertex_api_endpoint,
            max_tokens=config.max_tokens_ambassador,
            safety_settings={
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            },
        )

        history_text = _format_history(state.get("conversation_history", []))
        messages = []
        if history_text:
            messages.append(SystemMessage(content=history_text))
        messages.append(HumanMessage(content=content))

        response = await llm.with_config(tags=["final_response"]).ainvoke(messages)
        if hasattr(response, "response_metadata"):
            logger.info(
                "ambassador_llm_node: finish_reason",
                extra={"json_fields": {"finish_reason": response.response_metadata.get("finish_reason")}},
            )

        raw_response = extract_text_content(response)

        logger.info(
            "ambassador_llm_node: complete",
            extra={"json_fields": {"node": "ambassador_llm_node", "thread_id": thread_id}},
        )

        return {
            "raw_response": raw_response,
            "route_path": "ambassador",
            "source": "fmp_profile" if has_fmp_data else "llm_knowledge",
            "ambassador_used_fmp_data": has_fmp_data,
        }

    except Exception as exc:
        logger.error(
            "ambassador_llm_node: error",
            extra={"json_fields": {"node": "ambassador_llm_node", "thread_id": thread_id, "error": str(exc)}},
        )
        return {
            "raw_response": (
                "I'm unable to provide a company overview right now. "
                "Please try again in a moment."
            ),
            "route_path": "error",
            "source": "error",
            "ambassador_used_fmp_data": False,
        }


async def doc_summary_node(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    company_name = state["company_name"]
    logger.info(
        "doc_summary_node: serving static response",
        extra={"json_fields": {"node": "doc_summary_node", "thread_id": thread_id}},
    )
    return {
        "final_response": (
            f"Full document summaries for 10-K, 10-Q, and 8-K filings are coming soon to Bizzie. "
            f"In the meantime, I can answer specific questions about {company_name}'s financials — "
            "try asking about revenue, earnings, or debt levels."
        ),
        "follow_ups": [
            f"What was {company_name}'s revenue last quarter?",
            f"What is {company_name}'s current debt level?",
            f"How has {company_name}'s free cash flow trended?",
        ],
        "route_path": "doc_summary",
        "source": "static",
    }
