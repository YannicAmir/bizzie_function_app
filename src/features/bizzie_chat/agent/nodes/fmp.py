import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.constants.fmp_constants import (
    EOD_PRICE_TOOLS,
    ET_TIMEZONE,
    FORBIDDEN_FMP_TOOLS,
    MARKET_CLOSE_MINUTES,
    PRIORITY_FMP_TOOLS,
)
from src.features.bizzie_chat.agent.nodes.circuit_breaker import (
    _get_thread_id,
    _read_circuit_breaker,
    _record_fmp_failure,
    _record_fmp_success,
)
from src.features.bizzie_chat.agent.prompts.fmp_prompts import (
    build_manual_summary_system,
    build_manual_summary_user,
    build_plan_system,
    build_synth_system,
    build_synth_user,
)
from src.features.bizzie_chat.agent.prompts.shared import _format_history, extract_text_content
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import (
    FMP_TOOL_CATEGORIES,
    call_fmp_tool,
    get_fmp_tools,
)

logger = logging.getLogger(__name__)


def _should_show_price_disclaimer(
    tool_results: list[tuple[str, Any]],
    fmp_name_map: dict[str, str],
) -> bool:
    now_et = datetime.now(tz=ET_TIMEZONE)
    if now_et.hour * 60 + now_et.minute >= MARKET_CLOSE_MINUTES:
        return False 
    today_str = now_et.strftime("%Y-%m-%d")
    for raw_name, data in tool_results:
        orig_name = fmp_name_map.get(raw_name, raw_name)
        if orig_name not in EOD_PRICE_TOOLS:
            continue
        records = data if isinstance(data, list) else (data.get("historical") if isinstance(data, dict) else None)
        if records and isinstance(records[0], dict) and records[0].get("date") == today_str:
            return True
    return False


def _validate_referenced_ticker(ticker: str | None, thread_id: str) -> str | None:
    if not ticker:
        return None
    normalized = ticker.replace(".", "-")
    if not re.match(r"^[A-Z]{1,5}(-[A-Z]{1,2})?$", normalized):
        logger.warning(
            "fmp_agent: referenced_ticker failed format validation",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
        )
        return None
    return normalized


def _sanitize_tools(raw_tools: list[Any]) -> tuple[list[Any], dict[str, str]]:
    fmp_name_map: dict[str, str] = {}
    sanitized: list[Any] = []
    for t in raw_tools:
        orig = t.name
        san = orig if (orig and (orig[0].isalpha() or orig[0] == "_")) else f"t_{orig}"
        san = re.sub(r'[^a-zA-Z0-9_\.\:\-]', '_', san)
        san = san[:64]
        if san != orig:
            fmp_name_map[san] = orig
            t = t.model_copy(update={"name": san})
        sanitized.append(t)
    return sanitized, fmp_name_map


def _filter_tools(
    sanitized_tools: list[Any],
    fmp_name_map: dict[str, str],
    required_cats: list[str],
    thread_id: str,
) -> list[Any]:
    allowed = [
        t for t in sanitized_tools
        if fmp_name_map.get(t.name, t.name) not in FORBIDDEN_FMP_TOOLS
    ]
    priority = [t for t in allowed if fmp_name_map.get(t.name, t.name) in PRIORITY_FMP_TOOLS]
    other = [t for t in allowed if fmp_name_map.get(t.name, t.name) not in PRIORITY_FMP_TOOLS]

    active_names: set[str] = set()
    for cat in required_cats:
        active_names.update(FMP_TOOL_CATEGORIES.get(cat, []))

    filtered = [
        t for t in priority + other
        if fmp_name_map.get(t.name, t.name) in active_names
    ][:60]

    if not filtered:
        logger.warning(
            "fmp_agent: dynamic router yielded 0 tools, falling back to default top 15",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
        )
        return (priority + other)[:15]
    return filtered


def _select_model(state: BizzieState) -> str:
    if state.get("requires_deep_reasoning", False):
        return state.get("model_flash") or config.model_flash
    return state.get("model_flash_lite") or config.model_flash_lite


def _parse_tool_plan(plan_text: str, thread_id: str) -> list[dict[str, Any]]:
    try:
        clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", plan_text.strip(), flags=re.DOTALL)
        result = json.loads(clean)
        return result if isinstance(result, list) else []
    except Exception as exc:
        logger.warning(
            "fmp_agent: failed to parse tool plan, falling back to empty",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "error": str(exc)}},
        )
        return []


async def _execute_planned_tool(
    tool_call: dict[str, Any],
    fmp_name_map: dict[str, str],
    thread_id: str,
) -> tuple[str, Any, bool]:
    t_name = tool_call.get("tool") or ""
    t_args = tool_call.get("args") or {}
    orig_name = fmp_name_map.get(t_name, t_name)
    logger.info(
        "fmp_agent: executing tool",
        extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "tool": t_name, "cycle": "parallel-execute"}},
    )
    try:
        res = await call_fmp_tool(orig_name, t_args)
        return t_name, res, True
    except Exception as exc:
        return t_name, f"Tool error: {str(exc)}", False


async def _execute_tool_plan(
    tool_plan: list[dict[str, Any]],
    fmp_name_map: dict[str, str],
    cb_data: dict[str, Any],
    thread_id: str,
) -> tuple[list[tuple[str, Any]], bool]:
    if not tool_plan:
        logger.warning(
            "fmp_agent: empty tool plan — no tools executed",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
        )
        return [], False

    raw_results = await asyncio.gather(*[
        _execute_planned_tool(tc, fmp_name_map, thread_id) for tc in tool_plan
    ])
    tool_results: list[tuple[str, Any]] = []
    for t_name, res, success in raw_results:
        tool_results.append((t_name, res))
        if success:
            await _record_fmp_success()
        else:
            await _record_fmp_failure(cb_data)
    return tool_results, True


async def _attempt_big_hammer_fallback(
    response: Any,
    fmp_called: bool,
    tool_results: list[tuple[str, Any]],
    llm: Any,
    company_name: str,
    company_ticker: str,
    query: str,
    thread_id: str,
) -> tuple[Any, bool]:
    content = response.content if hasattr(response, "content") else str(response)
    if content or not fmp_called:
        return response, False

    logger.warning(
        "fmp_agent: model returned empty content, attempting 'Big Hammer' manual summary",
        extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
    )
    tool_data_blocks = [
        f"--- TOOL RESULT ({name}) ---\n{json.dumps(data) if not isinstance(data, str) else data}\n"
        for name, data in tool_results
    ]
    if not tool_data_blocks:
        return response, False

    mega_research_text = "\n".join(tool_data_blocks)
    manual_summary_prompt = [
        SystemMessage(content=build_manual_summary_system(
            company_name, company_ticker, datetime.now().strftime("%B %-d, %Y")
        )),
        HumanMessage(content=build_manual_summary_user(mega_research_text, query)),
    ]
    return await llm.ainvoke(manual_summary_prompt), True



async def fmp_agent(state: BizzieState) -> dict[str, Any]:
    thread_id = _get_thread_id(state)
    company_ticker = state["company_ticker"]
    company_name = state["company_name"]
    references_different = state.get("references_different_company", False)
    referenced_ticker = _validate_referenced_ticker(state.get("referenced_ticker"), thread_id)
    experience = state.get("investing_experience", "intermediate")

    logger.info(
        "fmp_agent: start",
        extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "ticker": company_ticker}},
    )

    try:
        raw_tools = await get_fmp_tools()
        sanitized_tools, fmp_name_map = _sanitize_tools(raw_tools)
        required_cats = state.get("required_data_categories") or ["NEWS", "PRICE_PERFORMANCE"]
        fmp_tools = _filter_tools(sanitized_tools, fmp_name_map, required_cats, thread_id)

        selected_model = _select_model(state)
        logger.info(
            "fmp_agent: model selected",
            extra={"json_fields": {
                "node": "fmp_agent",
                "thread_id": thread_id,
                "deep_reasoning": state.get("requires_deep_reasoning", False),
                "model": selected_model,
            }},
        )

        llm = ChatGoogleGenerativeAI(
            model=selected_model,
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

        today_str = datetime.now().strftime("%A, %B %-d, %Y")
        history_text = _format_history(state.get("conversation_history", []))
        tool_schema_summary = "\n".join(
            f"- {t.name}: {(t.description or '')[:120]}" for t in fmp_tools
        )

        plan_system = build_plan_system(
            company_name, company_ticker, today_str, tool_schema_summary,
            references_different, referenced_ticker,
        )
        plan_messages: list[Any] = [SystemMessage(content=plan_system)]
        if history_text:
            plan_messages.append(SystemMessage(content=history_text))
        plan_messages.append(HumanMessage(content=state["query"]))

        plan_response = await llm.ainvoke(plan_messages)
        plan_text = plan_response.content if isinstance(plan_response.content, str) else ""
        logger.info(
            "fmp_agent: plan generated",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "plan_preview": plan_text[:200]}},
        )

        tool_plan = _parse_tool_plan(plan_text, thread_id)

        cb_data: dict[str, Any] = {}
        try:
            cb_data = await _read_circuit_breaker()
        except Exception:
            pass

        tool_results, fmp_called = await _execute_tool_plan(tool_plan, fmp_name_map, cb_data, thread_id)

        research_blocks = "\n\n".join(
            f"=== {name} ===\n{json.dumps(data) if not isinstance(data, str) else data}"
            for name, data in tool_results
        )
        show_price_disclaimer = _should_show_price_disclaimer(tool_results, fmp_name_map)

        synth_system = build_synth_system(
            company_name, company_ticker, today_str, experience,
            references_different, referenced_ticker,
        )
        synth_messages: list[Any] = [
            SystemMessage(content=synth_system),
            HumanMessage(content=build_synth_user(research_blocks, state["query"])),
        ]
        response = await llm.with_config(tags=["final_response"]).ainvoke(synth_messages)

        response, was_big_hammer = await _attempt_big_hammer_fallback(
            response, fmp_called, tool_results, llm,
            company_name, company_ticker, state["query"], thread_id,
        )

        raw_response = extract_text_content(response)
        if not raw_response:
            logger.error(
                "fmp_agent: empty response generated, tool saturation or safety block likely",
                extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
            )
            raw_response = (
                "I encountered an internal error processing the financial data (empty response generated). "
                "The query may be too broad or trigger internal safety filters. "
                "Try asking a more specific question."
            )

        metadata = dict(state.get("metadata") or {})
        metadata["fmp_attempted"] = fmp_called

        logger.info(
            "fmp_agent: complete",
            extra={"json_fields": {
                "node": "fmp_agent",
                "thread_id": thread_id,
                "content_length": len(raw_response),
                "fmp_called": fmp_called,
                "was_big_hammer": was_big_hammer,
                "preview": raw_response[:100],
            }},
        )

        return {
            "fmp_result": raw_response,
            "raw_response": raw_response,
            "fmp_error": None,
            "route_path": "fmp",
            "source": "fmp",
            "show_price_disclaimer": show_price_disclaimer,
            "metadata": metadata,
        }

    except Exception as exc:
        logger.error(
            "fmp_agent: error",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "error": str(exc)}},
        )
        metadata = dict(state.get("metadata") or {})
        metadata["fmp_attempted"] = True
        return {
            "fmp_result": None,
            "fmp_error": str(exc),
            "raw_response": None,
            "metadata": metadata,
        }
