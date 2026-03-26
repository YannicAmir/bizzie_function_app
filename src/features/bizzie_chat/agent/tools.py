import asyncio
import logging
from typing import Any

from langchain_tavily import TavilySearch
from langchain_mcp_adapters.client import MultiServerMCPClient

from src.features.bizzie_chat.agent.config import config

logger = logging.getLogger(__name__)

def strip_unsupported_keys(d: Any) -> None:
    """Recursively strip keys (additionalProperties, $schema, nullable, default) for Gemini compatibility."""
    if not isinstance(d, dict):
        return
    forbidden = ["additionalProperties", "$schema", "nullable", "default"]
    for k in forbidden:
        d.pop(k, None)
    for v in d.values():
        if isinstance(v, dict):
            strip_unsupported_keys(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    strip_unsupported_keys(item)

FMP_TOOL_CATEGORIES = {
    "FINANCIAL_STATEMENTS": [
        "8k-latest", "as-reported-balance-statements", "as-reported-cashflow-statements", 
        "as-reported-financial-statements", "as-reported-income-statements", "balance-sheet-statement", 
        "balance-sheet-statement-growth", "balance-sheet-statements-ttm", "cashflow-statement", 
        "cashflow-statement-growth", "cashflow-statements-ttm", "financial-reports-form-10-k-json", 
        "financial-reports-form-10-k-xlsx", "financial-statement-growth", "financials-latest", 
        "income-statement", "income-statement-growth", "income-statements-ttm", 
        "revenue-geographic-segments", "revenue-product-segmentation", "financial-reports-dates", 
        "latest-filings", "latest-financial-statements"
    ],
    "NEWS": ["general-news", "stock-news", "fmp-articles"],
    "CALENDAR": ["dividends-calendar", "earnings-calendar", "ipos-calendar"],
    "PROFILE": [
        "company-executives", "dividends-company", "earnings-company", "information", "profile-symbol", 
        "employee-count", "executive-compensation", "company-notes", "historical-employee-count", 
        "latest-mergers-acquisitions"
    ],
    "METRICS_VALUATION": [
        "key-metrics", "key-metrics-ttm", "market-cap", "metrics-ratios", "metrics-ratios-ttm", 
        "historical-industry-pe", "historical-market-cap", "historical-sector-pe", "industry-PE-snapshot", 
        "sector-PE-snapshot"
    ],
    "PRICE_PERFORMANCE": [
        "historical-industry-performance", "historical-price-eod-dividend-adjusted", 
        "historical-price-eod-full", "historical-price-eod-light", "historical-sector-performance", 
        "industry-performance-snapshot", "sector-performance-snapshot"
    ],
    "IPOS": ["ipos-disclosure", "ipos-prospectus"]
}

GUARDIAN_CLASSIFIER_TOOL: dict[str, Any] = {
    "name": "classify_query",
    "description": "Classify the user query. Return all required fields.",
    "parameters": {
        "type": "object",
        "properties": {
            "non_stock_related": {
                "type": "boolean",
                "description": "True if the query has nothing to do with stocks, finance, or investing.",
            },
            "requesting_investment_advice": {
                "type": "boolean",
                "description": "Buy/sell/hold recommendation or personal investment advice.",
            },
            "requesting_doc_summary": {
                "type": "boolean",
                "description": "Asking for a 10-K, 10-Q, or 8-K document summary.",
            },
            "references_different_company": {
                "type": "boolean",
                "description": "Query primarily asks about a company OTHER than the one in context.",
            },
            "referenced_ticker": {
                "type": "string",
                "description": "Ticker symbol of the referenced company if identifiable.",
            },
            "required_data_categories": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "FINANCIAL_STATEMENTS", "NEWS", "CALENDAR", 
                        "PROFILE", "METRICS_VALUATION", "PRICE_PERFORMANCE", "IPOS"
                    ]
                },
                "description": "Functional categories of data required to fulfill the request."
            },
            "requires_deep_reasoning": {
                "type": "boolean",
                "description": "Complex multi-step analysis or qualitative synthesis vs straightforward lookup.",
            },
        },
        "required": [
            "non_stock_related",
            "requesting_investment_advice",
            "requesting_doc_summary",
            "references_different_company",
            "required_data_categories",
            "requires_deep_reasoning",
        ],
    },
}

def get_tavily_tool() -> TavilySearch:
    """Return configured Tavily search tool."""
    return TavilySearch(
        tavily_api_key=config.tavily_api_key,
        max_results=5,
        search_depth="advanced",
        include_answer=True,
        include_raw_content=False,
        include_domains=[
            "reuters.com", "bloomberg.com", "wsj.com", "sec.gov",
            "finance.yahoo.com", "marketwatch.com", "investors.com",
        ],
    )

async def _get_fmp_client() -> MultiServerMCPClient:
    """Build a MultiServerMCPClient asynchronously."""
    return await asyncio.to_thread(
        MultiServerMCPClient,
        {
            "fmp": {
                "url": config.fmp_mcp_url,
                "transport": "streamable_http",
            }
        }
    )

async def get_fmp_tools() -> list[Any]:
    """Return available sanitized FMP tools."""
    client = await _get_fmp_client()
    tools = await client.get_tools()
    
    for _t in tools:
        if hasattr(_t, "args"):
            _san_args = _t.args.copy()
            strip_unsupported_keys(_san_args)
            if hasattr(_t, "model_copy"):
                _t = _t.model_copy(update={"args": _san_args})
    
    logger.info("Loaded sanitized FMP tools", extra={"json_fields": {"tool_count": len(tools)}})
    return tools

async def call_fmp_tool(tool_name: str, args: dict[str, Any]) -> Any:
    """Call a single FMP MCP tool directly."""
    client = await _get_fmp_client()
    tools = await client.get_tools()
    tool = next((t for t in tools if t.name == tool_name), None)
    if tool is None:
        raise ValueError(f"FMP tool '{tool_name}' not found")
    return await tool.ainvoke(args)
