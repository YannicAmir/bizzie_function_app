"""
Ambassador path nodes.

Handles investment-advice redirect queries:
  ambassador_fmp_call: Fetches company profile from FMP (no LLM).
  ambassador_llm_node: Generates a company overview / advice redirect.
  doc_summary_node: Static coming-soon stub for document summary requests.
"""

import json
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
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import call_fmp_tool

logger = logging.getLogger(__name__)

CONCISE_DIRECTIVE = (
    "RESPONSE STYLE: Write for a mobile chat UI. Be direct and concise. "
    "Max 3-5 short paragraphs. No lengthy summaries or closing recaps. "
    "Cut all filler and redundancy.\n"
)

PRICE_DISCLAIMER = "Note: Prices shown are delayed by 15 minutes."


def _experience_instruction(investing_experience: str) -> str:
    """Return the tone/complexity instruction for a given experience level."""
    if investing_experience == "beginner":
        return (
            "Tailor your response for a complete beginner: use plain language, "
            "real-world analogies, no jargon. Define every financial term you use. "
            "Assume zero prior knowledge."
        )
    if investing_experience == "intermediate":
        return (
            "Tailor your response for an intermediate investor: simplify explanations, "
            "define specialist or advanced terms inline, avoid dense ratio-heavy language."
        )
    return (
        "Tailor your response for an expert investor: be concise, assume full financial "
        "literacy, include relevant ratios and metrics without defining them."
    )


def _format_history(conversation_history: list[dict], max_turns: int = 6) -> str:
    """Format the last max_turns of conversation history as a readable string for LLM context."""
    if not conversation_history:
        return ""
    lines = ["Previous conversation:"]
    for turn in conversation_history[-max_turns:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        lines.append(f"{role.capitalize()}: {content}")
    return "\n".join(lines)


async def ambassador_fmp_call(state: BizzieState) -> dict[str, Any]:
    """
    Fetch company profile data via FMP MCP — no LLM.
    Fetches profile for company_ticker, and for referenced_ticker if
    references_different_company=True and ticker passes format validation.
    Updates the shared circuit breaker on success/failure.
    """
    thread_id = _get_thread_id(state)
    ticker = state["company_ticker"]
    logger.info(
        "ambassador_fmp_call: start",
        extra={"json_fields": {"node": "ambassador_fmp_call", "thread_id": thread_id, "ticker": ticker}},
    )

    cb_data: dict[str, Any] = {}
    try:
        cb_data = await _read_circuit_breaker()
    except Exception:
        pass

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
            referenced_ticker = None

    profiles: dict[str, Any] = {}
    last_error: Exception | None = None

    for t in tickers_to_fetch:
        for attempt in range(config.fmp_retry_attempts + 1):
            try:
                result = await call_fmp_tool("profile-symbol", {"symbol": t})
                profiles[t] = result
                break
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
                                "ticker": t,
                            }
                        },
                    )

    if profiles:
        await _record_fmp_success(cb_data)
        fmp_company_profile = profiles
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
        metadata = dict(state.get("metadata") or {})
        metadata["fmp_attempted"] = True
        return {
            "fmp_company_profile": fmp_company_profile,
            "metadata": metadata,
        }
    else:
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
        metadata = dict(state.get("metadata") or {})
        metadata["fmp_attempted"] = True
        return {
            "fmp_company_profile": None,
            "metadata": metadata,
        }


async def ambassador_llm_node(state: BizzieState) -> dict[str, Any]:
    """Generate company overview or investment-advice redirect, using FMP data where available."""
    thread_id = _get_thread_id(state)
    logger.info(
        "ambassador_llm_node: start",
        extra={"json_fields": {"node": "ambassador_llm_node", "thread_id": thread_id}},
    )

    fmp_profile = state.get("fmp_company_profile")
    references_different = state.get("references_different_company", False)
    company_name = state["company_name"]
    company_ticker = state["company_ticker"]
    referenced_ticker = state.get("referenced_ticker")
    experience = state.get("investing_experience", "intermediate")

    has_fmp_data = bool(fmp_profile)
    ambassador_used_fmp = has_fmp_data

    if not references_different and has_fmp_data:
        fmp_summary = json.dumps(fmp_profile.get(company_ticker, fmp_profile), indent=2)[:2000]
        content = (
            CONCISE_DIRECTIVE +
            f"The user is asking about {company_name} ({company_ticker}) but has requested investment advice. "
            "Bizzie does not provide investment advice. Instead:\n"
            "1. Acknowledge that Bizzie doesn't give buy/sell/hold recommendations.\n"
            f"2. Provide a factual company overview grounded in this FMP data:\n{fmp_summary}\n"
            "3. Suggest 3-4 specific financial questions the user could research to evaluate the company "
            "(e.g., revenue growth, free cash flow, debt levels, margins, P/E ratio).\n"
            f"4. If you reference the current or most recent stock price in your response, "
            f"append exactly: '{PRICE_DISCLAIMER}'\n\n"
            f"{_experience_instruction(experience)}\n\n"
            f"User query: {state['query']}"
        )
    elif not references_different and not has_fmp_data:
        content = (
            CONCISE_DIRECTIVE +
            f"The user is asking about {company_name} ({company_ticker}) but has requested investment advice. "
            "Bizzie does not provide investment advice. Instead:\n"
            "1. Acknowledge that Bizzie doesn't give buy/sell/hold recommendations.\n"
            f"2. Provide a factual company overview of {company_name} based on your training knowledge.\n"
            "3. Suggest 3-4 specific financial questions the user could research.\n"
            "End with exactly this disclaimer: "
            '"Note: the company overview above is based on general background knowledge '
            'and may not reflect the most current information."\n\n'
            f"{_experience_instruction(experience)}\n\n"
            f"User query: {state['query']}"
        )
    elif references_different and has_fmp_data:
        fmp_current = json.dumps(fmp_profile.get(company_ticker, {}), indent=2)[:1000]
        fmp_ref = json.dumps(fmp_profile.get(referenced_ticker, {}), indent=2)[:1000] if referenced_ticker else ""
        ref_name = referenced_ticker or "the referenced company"
        content = (
            CONCISE_DIRECTIVE +
            "The user is asking about a different company while viewing "
            f"{company_name} ({company_ticker}). Bizzie does not provide investment advice. Instead:\n"
            f"1. Briefly address the question about {ref_name} directly (2-3 sentences), "
            f"grounded in this data:\n{fmp_ref}\n"
            f"2. Pivot: 'Since you're viewing {company_name}, here's how they compare...' "
            f"grounded in this data:\n{fmp_current}\n"
            "3. Suggest financial questions covering both companies where relevant.\n"
            f"4. If you reference the current or most recent stock price in your response, "
            f"append exactly: '{PRICE_DISCLAIMER}'\n\n"
            f"{_experience_instruction(experience)}\n\n"
            f"User query: {state['query']}"
        )
    else:
        ref_name = referenced_ticker or "the referenced company"
        content = (
            CONCISE_DIRECTIVE +
            "The user is asking about a different company while viewing "
            f"{company_name} ({company_ticker}). Bizzie does not provide investment advice. Instead:\n"
            f"1. Briefly address the question about {ref_name} directly (2-3 sentences) "
            "using your training knowledge.\n"
            f"2. Pivot: 'Since you're viewing {company_name}, here's how they compare...' "
            "using your training knowledge.\n"
            "3. Suggest financial questions covering both companies where relevant.\n"
            "End with exactly this disclaimer: "
            '"Note: company information above is based on general background knowledge '
            'and may not reflect the most current information."\n\n'
            f"{_experience_instruction(experience)}\n\n"
            f"User query: {state['query']}"
        )

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
            logger.info(f"ambassador_llm_node: finish_reason: {response.response_metadata.get('finish_reason')}")

        if isinstance(response.content, str):
            raw_response = response.content
        elif isinstance(response.content, list):
            raw_response = "".join([p.get("text", "") if isinstance(p, dict) else str(p) for p in response.content])
        else:
            raw_response = str(response.content)

        logger.info(
            "ambassador_llm_node: complete",
            extra={"json_fields": {"node": "ambassador_llm_node", "thread_id": thread_id}},
        )

        return {
            "raw_response": raw_response,
            "route_path": "ambassador",
            "source": "fmp_profile" if ambassador_used_fmp else "llm_knowledge",
            "ambassador_used_fmp_data": ambassador_used_fmp,
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
    """
    Static coming-soon message for document summary requests.
    No LLM. Does NOT count against rate limit.
    """
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
