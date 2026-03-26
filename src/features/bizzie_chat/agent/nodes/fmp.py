"""
FMP stock research agent.

Implements a 2-shot plan-then-execute architecture:
  Shot 1 (Plan): LLM outputs a JSON array of FMP tool calls.
  Shot 2 (Synthesize): Tools are executed in parallel via asyncio.gather(),
    then the LLM synthesizes the results into a final answer.
"""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.state import BizzieState
from src.features.bizzie_chat.agent.tools import (
    FMP_TOOL_CATEGORIES,
    call_fmp_tool,
    get_fmp_tools,
)
from src.features.bizzie_chat.agent.nodes.circuit_breaker import (
    _get_thread_id,
    _read_circuit_breaker,
    _record_fmp_failure,
    _record_fmp_success,
)
from src.features.bizzie_chat.agent.nodes.ambassador import (
    _experience_instruction,
    _format_history,
    CONCISE_DIRECTIVE,
    PRICE_DISCLAIMER,
)

logger = logging.getLogger(__name__)

FORBIDDEN_FMP_TOOLS = {
    "COT-report",
    "COT-report-analysis",
    "COT-report-list",
    "acquisition-ownership",
    "aftermarket-quote",
    "aftermarket-trade",
    "all-commodities-quotes",
    "all-cryptocurrency-quotes",
    "all-forex-quotes",
    "all-index-quotes",
    "all-transaction-types",
    "average-directional-index",
    "batch-quote",
    "batch-quote-short",
    "country-weighting",
    "crowdfunding-search",
    "disclosures-dates",
    "disclosures-name-search",
    "dow-jones",
    "equity-offering-by-cik",
    "equity-offering-search",
    "esg-benchmark",
    "esg-ratings",
    "esg-search",
    "etf-asset-exposure",
    "grades",
    "grades-summary",
}

PRIORITY_FMP_TOOLS = {
    "8k-latest",
    "as-reported-balance-statements",
    "as-reported-cashflow-statements",
    "as-reported-financial-statements",
    "as-reported-income-statements",
    "balance-sheet-statement",
    "balance-sheet-statement-growth",
    "balance-sheet-statements-ttm",
    "cashflow-statement",
    "cashflow-statement-growth",
    "cashflow-statements-ttm",
    "financial-reports-form-10-k-json",
    "financial-reports-form-10-k-xlsx",
    "financial-statement-growth",
    "financials-latest",
    "form-13f-filings-dates",
    "general-news",
    "income-statement",
    "income-statement-growth",
    "income-statements-ttm",
    "revenue-geographic-segments",
    "revenue-product-segmentation",
    "stock-news",
    "company-executives",
    "dividends-calendar",
    "dividends-company",
    "earnings-calendar",
    "earnings-company",
    "financial-reports-dates",
    "fmp-articles",
    "information",
    "profile-symbol",
    "employee-count",
    "executive-compensation",
    "key-metrics",
    "key-metrics-ttm",
    "market-cap",
    "metrics-ratios",
    "metrics-ratios-ttm",
    "company-notes",
    "historical-industry-pe",
    "historical-industry-performance",
    "historical-market-cap",
    "historical-price-eod-dividend-adjusted",
    "historical-price-eod-full",
    "historical-price-eod-light",
    "historical-sector-pe",
    "historical-sector-performance",
    "latest-filings",
    "latest-financial-statements",
    "latest-mergers-acquisitions",
    "industry-performance-snapshot",
    "industry-PE-snapshot",
    "sector-PE-snapshot",
    "historical-employee-count",
    "sector-performance-snapshot",
    "ipos-calendar",
    "ipos-disclosure",
    "ipos-prospectus",
}


async def fmp_agent(state: BizzieState) -> dict[str, Any]:
    """
    LLM + FMP MCP tools for stock queries.
    Tool calls execute automatically in a loop (max 5 cycles, no human approval).
    Updates the shared circuit breaker on FMP call outcomes.
    """
    thread_id = _get_thread_id(state)
    company_ticker = state["company_ticker"]
    company_name = state["company_name"]
    references_different = state.get("references_different_company", False)
    referenced_ticker = state.get("referenced_ticker")
    experience = state.get("investing_experience", "intermediate")

    logger.info(
        "fmp_agent: start",
        extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "ticker": company_ticker}},
    )

    # Validate referenced_ticker before any FMP call
    if referenced_ticker and not re.match(r"^[A-Z]{1,5}$", referenced_ticker):
        logger.warning(
            "fmp_agent: referenced_ticker failed format validation",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
        )
        referenced_ticker = None

    try:
        fmp_tools = await get_fmp_tools()

        _fmp_name_map: dict[str, str] = {}
        _sanitized_tools: list[Any] = []
        for _t in fmp_tools:
            _orig = _t.name

            _san = _orig if (_orig and (_orig[0].isalpha() or _orig[0] == "_")) else f"t_{_orig}"
            _san = re.sub(r'[^a-zA-Z0-9_\.\:\-]', '_', _san)
            _san = _san[:64]

            if _san != _orig:
                _fmp_name_map[_san] = _orig
                _t = _t.model_copy(update={"name": _san})
            _sanitized_tools.append(_t)

        _allowed_tools = []
        for _t in _sanitized_tools:
            _orig_name = _fmp_name_map.get(_t.name, _t.name)
            if _orig_name not in FORBIDDEN_FMP_TOOLS:
                _allowed_tools.append(_t)

        priority_tools = []
        other_tools = []
        for _t in _allowed_tools:
            _orig_name = _fmp_name_map.get(_t.name, _t.name)
            if _orig_name in PRIORITY_FMP_TOOLS:
                priority_tools.append(_t)
            else:
                other_tools.append(_t)

        required_cats = state.get("required_data_categories") or ["NEWS", "PRICE_PERFORMANCE"]

        deep_reasoning = state.get("requires_deep_reasoning", False)
        selected_model = (
            (state.get("model_flash") or config.model_flash)
            if deep_reasoning
            else (state.get("model_flash_lite") or config.model_flash_lite)
        )
        logger.info(
            "fmp_agent: model selected",
            extra={
                "json_fields": {
                    "node": "fmp_agent",
                    "thread_id": thread_id,
                    "deep_reasoning": deep_reasoning,
                    "model": selected_model,
                }
            },
        )
        active_cat_tool_names = set()
        for cat in required_cats:
            active_cat_tool_names.update(FMP_TOOL_CATEGORIES.get(cat, []))

        fmp_tools = []
        for _t in priority_tools + other_tools:
            _orig_name = _fmp_name_map.get(_t.name, _t.name)
            if _orig_name in active_cat_tool_names:
                fmp_tools.append(_t)

        fmp_tools = fmp_tools[:60]
        if not fmp_tools:
            logger.warning("Dynamic router yielded 0 tools. Falling back to default top 15.")
            fmp_tools = (priority_tools + other_tools)[:15]
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

        history_text = _format_history(state.get("conversation_history", []))
        today_str = datetime.now().strftime("%A, %B %-d, %Y")

        tool_schema_summary = "\n".join(
            f"- {t.name}: {(t.description or '')[:120]}"
            for t in fmp_tools
        )

        if references_different and referenced_ticker:
            plan_system = (
                f"You are a financial research planner. The user is viewing {company_name} ({company_ticker}) "
                f"and asking about {referenced_ticker} for comparison. Today: {today_str}.\n"
                f"Your ONLY job is to output a JSON array of tool calls needed to answer the query. "
                f"Use tools for BOTH {company_ticker} AND {referenced_ticker}. "
                f"Limit news to 15 articles max.\n\n"
                f"Available tools:\n{tool_schema_summary}\n\n"
                f"Output ONLY valid JSON array, no other text. Format: "
                f'[{{"tool": "tool-name", "args": {{"symbol": "UBER", ...}}}}]'
            )
        else:
            plan_system = (
                f"You are a financial research planner for {company_name} ({company_ticker}). Today: {today_str}.\n"
                f"Your ONLY job is to output a JSON array of FMP tool calls needed to fully answer the user's query. "
                f"Rules: (1) Use 'historical-price-eod-light' or 'historical-price-eod-full' for price data. "
                f"(2) Use 'stock-news' for news — set limit to 15 max. "
                f"(3) For time ranges, use YYYY-MM-DD format. "
                f"(4) Select only the tools truly needed — do NOT pad with extras. "
                f"(5) Always use {company_ticker} as the ticker symbol.\n\n"
                f"Available tools:\n{tool_schema_summary}\n\n"
                f"Output ONLY valid JSON array, no other text. Format: "
                f'[{{"tool": "tool-name", "args": {{"symbol": "{company_ticker}", ...}}}}]'
            )

        plan_messages: list[Any] = [SystemMessage(content=plan_system)]
        if history_text:
            plan_messages.append(SystemMessage(content=history_text))
        plan_messages.append(HumanMessage(content=state["query"]))

        plan_response = await llm.ainvoke(plan_messages)
        plan_text = plan_response.content if isinstance(plan_response.content, str) else ""

        logger.info(
            "fmp_agent: plan generated",
            extra={
                "json_fields": {
                    "node": "fmp_agent",
                    "thread_id": thread_id,
                    "plan_preview": plan_text[:200],
                }
            },
        )

        tool_plan: list[dict[str, Any]] = []
        try:
            clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", plan_text.strip(), flags=re.DOTALL)
            tool_plan = json.loads(clean)
            if not isinstance(tool_plan, list):
                tool_plan = []
        except Exception as parse_err:
            logger.warning(
                "fmp_agent: failed to parse tool plan, falling back to empty",
                extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id, "error": str(parse_err)}},
            )

        cb_data: dict[str, Any] = {}
        try:
            cb_data = await _read_circuit_breaker()
        except Exception:
            pass

        fmp_called = False
        tool_results: list[tuple[str, Any]] = []

        async def _execute_planned_tool(tool_call: dict[str, Any]) -> tuple[str, Any, bool]:
            t_name = tool_call.get("tool") or ""
            t_args = tool_call.get("args") or {}
            _orig = _fmp_name_map.get(t_name, t_name)
            logger.info(
                "fmp_agent: executing tool",
                extra={
                    "json_fields": {
                        "node": "fmp_agent",
                        "thread_id": thread_id,
                        "tool": t_name,
                        "cycle": "parallel-execute",
                    }
                },
            )
            try:
                res = await call_fmp_tool(_orig, t_args)
                return t_name, res, True
            except Exception as exc:
                return t_name, f"Tool error: {str(exc)}", False

        if tool_plan:
            raw_results = await asyncio.gather(*[_execute_planned_tool(tc) for tc in tool_plan])
            for t_name, res, success in raw_results:
                fmp_called = True
                tool_results.append((t_name, res))
                if success:
                    await _record_fmp_success(cb_data)
                else:
                    await _record_fmp_failure(cb_data)
        else:
            logger.warning("fmp_agent: empty tool plan — no tools executed", extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}})

        research_blocks = "\n\n".join(
            f"=== {name} ===\n{json.dumps(data) if not isinstance(data, str) else data}"
            for name, data in tool_results
        )

        EOD_PRICE_TOOLS = {
            "historical-price-eod-full",
            "historical-price-eod-light",
            "historical-price-eod-dividend-adjusted",
        }
        executed_tool_names = {_fmp_name_map.get(name, name) for name, _ in tool_results}
        used_price_data = bool(executed_tool_names & EOD_PRICE_TOOLS)
        price_disclaimer_instruction = (
            f"PRICE DATA DISCLAIMER: Append exactly: '{PRICE_DISCLAIMER}'\n"
            if used_price_data else ""
        )

        if references_different and referenced_ticker:
            synth_system = (
                CONCISE_DIRECTIVE +
                f"You are a world-class financial analyst. The user is viewing {company_name} ({company_ticker}) "
                f"and asked about {referenced_ticker}. Today: {today_str}.\n"
                f"Structure the response: (1) briefly cover {referenced_ticker} (2-3 sentences), "
                f"(2) pivot to {company_ticker} in depth. "
                f"If you used knowledge for {referenced_ticker}, append: "
                f"'Note: information about {referenced_ticker} is based on general knowledge and may not reflect the most current data.'\n"
                f"{price_disclaimer_instruction}"
                f"{_experience_instruction(experience)}"
            )
        else:
            synth_system = (
                CONCISE_DIRECTIVE +
                f"You are a world-class financial analyst. You are answering a question about {company_name} ({company_ticker}). "
                f"Today: {today_str}.\n"
                f"Synthesize the research data into a direct, narrative answer. "
                f"Explain the 'why', not just the 'what'.\n"
                f"{price_disclaimer_instruction}"
                f"{_experience_instruction(experience)}"
            )

        synth_messages: list[Any] = [
            SystemMessage(content=synth_system),
            HumanMessage(content=(
                f"RESEARCH DATA:\n{research_blocks}\n\n"
                f"USER QUESTION: {state['query']}\n\n"
                f"Write the final answer now:"
            )),
        ]

        response = await llm.ainvoke(synth_messages)

        if not (response.content if hasattr(response, "content") else str(response)) and fmp_called:
            logger.warning(
                "fmp_agent: model returned empty content, attempting 'Big Hammer' manual summary",
                extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
            )

            tool_data_blocks = []
            for m in messages:
                if isinstance(m, ToolMessage):
                    tool_data_blocks.append(f"--- TOOL RESULT ---\n{m.content}\n")

            if tool_data_blocks:
                mega_research_text = "\n".join(tool_data_blocks)
                manual_summary_prompt = [
                    SystemMessage(content=f"You are a financial analyst. Synthesize the following research data for {company_name} ({company_ticker}) into a deep, investigative final answer. "
                                          f"Always include the 15-minute price delay disclaimer.\n\nToday's Date: {datetime.now().strftime('%B %-d, %Y')}."),
                    HumanMessage(content=f"RESEARCH DATA:\n{mega_research_text}\n\nUSER QUESTION: {state['query']}\n\nProvide the final answer now:")
                ]

                response = await llm.ainvoke(manual_summary_prompt)

        if not (response.content if hasattr(response, "content") else str(response)):
            logger.error("fmp_agent: Absolute empty response generated. Tool saturation or safety block likely.",
                         extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}})
            raw_response = "I encountered an internal error processing the financial data (empty response generated). The query may be too broad or trigger internal safety filters. Try asking a more specific question."
        elif isinstance(response.content, str):
            raw_response = response.content
        elif isinstance(response.content, list):
            raw_response = "".join([p.get("text", "") if isinstance(p, dict) else str(p) for p in response.content])
        else:
            raw_response = str(response.content)

        logger.info(
            "fmp_agent: final content check",
            extra={
                "json_fields": {
                    "node": "fmp_agent",
                    "thread_id": thread_id,
                    "content_length": len(raw_response),
                    "fmp_called": fmp_called,
                    "preview": raw_response[:100],
                    "was_manual_summary": bool(not response.content and fmp_called and tool_data_blocks), # logic check
                }
            },
        )

        metadata = dict(state.get("metadata") or {})
        metadata["fmp_attempted"] = fmp_called

        logger.info(
            "fmp_agent: complete",
            extra={"json_fields": {"node": "fmp_agent", "thread_id": thread_id}},
        )

        return {
            "fmp_result": raw_response,
            "raw_response": raw_response,
            "fmp_error": None,
            "route_path": "fmp",
            "source": "fmp",
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
