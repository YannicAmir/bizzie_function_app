"""
Redis cache utilities for bizzie_chat.

Provides a module-level Redis singleton and cache-aside helpers for:
  - FMP API results (keyed by tool name + args hash, TTL by data category)
  - Guardian classifier results (keyed by query hash + ticker)

All operations fail silently — a Redis outage must never break a request.
"""

import hashlib
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from src.features.bizzie_chat.agent.config import config

logger = logging.getLogger(__name__)

# TTLs in seconds, per FMP data category
_CATEGORY_TTL: dict[str, int] = {
    "FINANCIAL_STATEMENTS": 86400,   # 24h — quarterly filings
    "PROFILE":              86400,   # 24h — rarely changes
    "METRICS_VALUATION":    14400,   #  4h — daily updates
    "PRICE_PERFORMANCE":      960,   # 16m — intraday
    "NEWS":                   300,   #  5m — continuously updated
    "CALENDAR":             21600,   #  6h — weekly cadence
    "IPOS":                  3600,   #  1h — moderate frequency
}

# Flat map: fmp_tool_name → TTL
# Mirrors FMP_TOOL_CATEGORIES from tools.py without importing it (avoids circular dep)
_TOOL_TTL: dict[str, int] = {
    # FINANCIAL_STATEMENTS
    **{t: _CATEGORY_TTL["FINANCIAL_STATEMENTS"] for t in [
        "8k-latest", "as-reported-balance-statements", "as-reported-cashflow-statements",
        "as-reported-financial-statements", "as-reported-income-statements",
        "balance-sheet-statement", "balance-sheet-statement-growth",
        "balance-sheet-statements-ttm", "cashflow-statement", "cashflow-statement-growth",
        "cashflow-statements-ttm", "financial-reports-form-10-k-json",
        "financial-reports-form-10-k-xlsx", "financial-statement-growth",
        "financials-latest", "income-statement", "income-statement-growth",
        "income-statements-ttm", "revenue-geographic-segments",
        "revenue-product-segmentation", "financial-reports-dates",
        "latest-filings", "latest-financial-statements",
    ]},
    # NEWS
    **{t: _CATEGORY_TTL["NEWS"] for t in [
        "general-news", "stock-news", "fmp-articles",
    ]},
    # CALENDAR
    **{t: _CATEGORY_TTL["CALENDAR"] for t in [
        "dividends-calendar", "earnings-calendar", "ipos-calendar",
    ]},
    # PROFILE
    **{t: _CATEGORY_TTL["PROFILE"] for t in [
        "company-executives", "dividends-company", "earnings-company",
        "information", "profile-symbol", "employee-count",
        "executive-compensation", "company-notes", "historical-employee-count",
        "latest-mergers-acquisitions",
    ]},
    # METRICS_VALUATION
    **{t: _CATEGORY_TTL["METRICS_VALUATION"] for t in [
        "key-metrics", "key-metrics-ttm", "market-cap", "metrics-ratios",
        "metrics-ratios-ttm", "historical-industry-pe", "historical-market-cap",
        "historical-sector-pe", "industry-PE-snapshot", "sector-PE-snapshot",
    ]},
    # PRICE_PERFORMANCE
    **{t: _CATEGORY_TTL["PRICE_PERFORMANCE"] for t in [
        "historical-industry-performance", "historical-price-eod-dividend-adjusted",
        "historical-price-eod-full", "historical-price-eod-light",
        "historical-sector-performance", "industry-performance-snapshot",
        "sector-performance-snapshot",
    ]},
    # IPOS
    **{t: _CATEGORY_TTL["IPOS"] for t in [
        "ipos-disclosure", "ipos-prospectus",
    ]},
}

_DEFAULT_TTL = 3600  # 1h for any tool not listed above

_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis | None:
    """Return the module-level Redis client, initialising it on first call.

    Returns None if REDIS_URL is not configured, so callers degrade gracefully.
    Short socket timeouts ensure a Redis failure never blocks a request.
    """
    global _redis_client
    if _redis_client is None and config.redis_url:
        _redis_client = aioredis.from_url(
            config.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _redis_client


def hash_query(query: str) -> str:
    """sha256 of query, first 16 hex chars. Safe for cache keys and logging — never stores raw text."""
    return hashlib.sha256(query.encode()).hexdigest()[:16]


def fmp_cache_key(tool_name: str, args: dict[str, Any]) -> str:
    args_hash = hashlib.sha256(json.dumps(args, sort_keys=True).encode()).hexdigest()[:12]
    return f"fmp:{tool_name}:{args_hash}"


def guardian_cache_key(query_hash: str, company_ticker: str) -> str:
    return f"guardian:{company_ticker}:{query_hash}"


async def cache_get(key: str) -> Any | None:
    """Return the cached value for key, or None on miss or any error."""
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.warning(
            "cache_get failed",
            extra={"json_fields": {"key": key, "error": str(exc)}},
        )
        return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    """Serialise value and store it with the given TTL. Silently ignores all errors."""
    client = _get_redis()
    if client is None:
        return
    try:
        await client.setex(key, ttl, json.dumps(value))
    except Exception as exc:
        logger.warning(
            "cache_set failed",
            extra={"json_fields": {"key": key, "error": str(exc)}},
        )


def fmp_ttl(tool_name: str) -> int:
    """Return the cache TTL in seconds for a given FMP tool name."""
    return _TOOL_TTL.get(tool_name, _DEFAULT_TTL)
