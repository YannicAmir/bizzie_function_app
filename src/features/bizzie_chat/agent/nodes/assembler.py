"""
Response post-processing nodes.

response_sanitizer: Strips FMP branding and internal tool phrasing.
follow_up_generator: Generates 3 contextual follow-up questions via Gemini Flash Lite.
response_assembler: Final deterministic assembly — combines sanitized text,
  follow-ups, and computes latency metadata.

response_sanitizer and follow_up_generator run in PARALLEL.
response_assembler fans in after both complete.
"""

import ast
import json
import logging
import re
import time
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.cache import cache_get, cache_set, hash_query
from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.nodes.circuit_breaker import _get_thread_id
from src.features.bizzie_chat.agent.nodes.ambassador import PRICE_DISCLAIMER

logger = logging.getLogger(__name__)

_SANITIZE_PATTERNS = [
    re.compile(r"\bFMP\b", re.IGNORECASE),
    re.compile(r"Financial Modeling Prep", re.IGNORECASE),
    re.compile(r"\bSearching\s+(income|balance|cash flow)\s+statements?\.{0,3}", re.IGNORECASE),
    re.compile(r"\bLooking\s+(up|at|through)\s+.{0,40}?\.\.\.", re.IGNORECASE),
    re.compile(r"\bQuerying\s+.{0,40}?\.\.\.", re.IGNORECASE),
    re.compile(r"\bFetching\s+.{0,40}?\.\.\.", re.IGNORECASE),
    # Strip any LLM-generated price disclaimer — the assembler appends it
    # deterministically via show_price_disclaimer, so we never want duplicates.
    re.compile(r"Note:\s*Prices?\s+shown\s+are\s+delayed\s+by\s+15\s+minutes\.?", re.IGNORECASE),
]


async def response_sanitizer(state: BizzieState) -> dict[str, Any]:
    """Strip FMP branding and internal tool phrasing from the raw LLM response."""
    thread_id = _get_thread_id(state)
    raw = state.get("raw_response") or ""

    sanitized = raw
    for pattern in _SANITIZE_PATTERNS:
        sanitized = pattern.sub("", sanitized)

    sanitized = re.sub(r"  +", " ", sanitized).strip()

    logger.info(
        "response_sanitizer: complete",
        extra={"json_fields": {"node": "response_sanitizer", "thread_id": thread_id}},
    )

    return {"sanitized_response": sanitized}


async def follow_up_generator(state: BizzieState) -> dict[str, Any]:
    """
    Generate 3 contextual follow-up questions using Gemini Flash Lite.
    Runs in PARALLEL with response_sanitizer.
    Forces JSON array output. On parse failure: returns empty array (never throws).
    """
    thread_id = _get_thread_id(state)
    company_ticker = state["company_ticker"]
    company_name = state["company_name"]
    references_different = state.get("references_different_company", False)
    referenced_ticker = state.get("referenced_ticker")
    route_path = state.get("route_path", "unknown")
    query_hash = hash_query(state["query"])
    followup_cache_key = f"followups:{company_ticker}:{route_path}:{query_hash}"

    logger.info(
        "follow_up_generator: start",
        extra={"json_fields": {"node": "follow_up_generator", "thread_id": thread_id}},
    )

    cached_followups = await cache_get(followup_cache_key)
    if cached_followups is not None:
        logger.info(
            "follow_up_generator: cache hit",
            extra={"json_fields": {"node": "follow_up_generator", "thread_id": thread_id}},
        )
        return {"follow_ups": cached_followups}

    try:
        llm = ChatGoogleGenerativeAI(
            model=state.get("model_flash_lite") or config.model_flash_lite,
            project=config.gcp_project,
            location=config.gcp_location,
            base_url=config.vertex_api_endpoint,
            max_tokens=config.max_tokens_follow_up,
            model_kwargs={"response_mime_type": "application/json"},
            safety_settings={
                "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
                "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
                "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            },
        )

        if references_different and referenced_ticker:
            prompt = (
                f"The user asked about {company_name} ({company_ticker}) in context of comparing with {referenced_ticker}. "
                "Generate exactly 3 short, 1-sentence follow-up questions for a curious investor. "
                "Return as a JSON array of strings: [\"question 1\", \"question 2\", \"question 3\"]"
            )
        else:
            prompt = (
                f"Based on a question about {company_name} ({company_ticker}), "
                "generate exactly 3 short, 1-sentence follow-up questions for a curious investor. "
                "Return as a JSON array of strings: [\"question 1\", \"question 2\", \"question 3\"]"
            )

        messages = [
            SystemMessage(content="You are a helpful investment assistant that only speaks in JSON arrays."),
            HumanMessage(content=f"{prompt}\n\nUser query: {state['query']}")
        ]

        response = await llm.ainvoke(messages)
        content = getattr(response, "content", None)
        if isinstance(content, str):
            raw = content
        elif isinstance(content, list):
            raw = "".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in content
                if not isinstance(block, dict) or block.get("type") == "text"
            )
        else:
            raw = ""

        raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
        start_idx = raw.find("[")
        end_idx = raw.rfind("]")
        if start_idx != -1 and end_idx != -1:
            raw = raw[start_idx : end_idx + 1]

        try:
            follow_ups: list[str] = json.loads(raw)
        except json.JSONDecodeError:
            try:
                follow_ups = ast.literal_eval(raw)
            except Exception:
                follow_ups = re.findall(r'"([^"]*)"', raw)
                if not follow_ups:
                    follow_ups = re.findall(r"'([^']*)'", raw)

        if not isinstance(follow_ups, list):
            follow_ups = []

        if len(follow_ups) == 1 and "\n" in follow_ups[0]:
            follow_ups = [q.strip() for q in follow_ups[0].split("\n") if q.strip()]

        follow_ups = [str(q) for q in follow_ups[:3]]

        logger.info(
            "follow_up_generator: complete",
            extra={"json_fields": {"node": "follow_up_generator", "thread_id": thread_id, "count": len(follow_ups)}},
        )
        await cache_set(followup_cache_key, follow_ups, 1800)
        return {"follow_ups": follow_ups}

    except (json.JSONDecodeError, Exception) as exc:
        logger.warning(
            "follow_up_generator: failed, returning empty",
            extra={"json_fields": {"node": "follow_up_generator", "thread_id": thread_id, "error": str(exc)}},
        )
        return {"follow_ups": []}


async def response_assembler(state: BizzieState) -> dict[str, Any]:
    """Assemble the final response from sanitized text, follow-ups, and metadata."""
    thread_id = _get_thread_id(state)
    logger.info(
        "response_assembler: start",
        extra={"json_fields": {"node": "response_assembler", "thread_id": thread_id}},
    )

    message = (
        state.get("sanitized_response")
        or state.get("raw_response")
        or "I'm sorry, I couldn't fetch the financial data for that query right now. Please try again or ask something else."
    )

    if state.get("show_price_disclaimer"):
        message = f"{message}\n\n_{PRICE_DISCLAIMER}_"

    follow_ups = state.get("follow_ups") or []
    route_path = state.get("route_path") or "error"
    source = state.get("source") or "error"

    metadata = dict(state.get("metadata") or {})
    start_time = metadata.get("start_time")
    if start_time:
        metadata["latency_ms"] = round((time.time() - start_time) * 1000, 2)

    logger.info(
        "response_assembler: complete",
        extra={
            "json_fields": {
                "node": "response_assembler",
                "thread_id": thread_id,
                "route_path": route_path,
                "source": source,
                "latency_ms": metadata.get("latency_ms"),
            }
        },
    )

    return {
        "final_response": message,
        "follow_ups": follow_ups,
        "route_path": route_path,
        "source": source,
        "metadata": metadata,
    }
