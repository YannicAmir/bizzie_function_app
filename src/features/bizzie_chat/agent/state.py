from typing import TypedDict


class BizzieState(TypedDict):
    # ── Input fields (set at graph entry, never mutated) ──────────────────────
    uid: str
    session_id: str
    query: str
    company_ticker: str
    company_name: str
    investing_experience: str          # "beginner" | "intermediate" | "expert"
    conversation_history: list[dict]   # last 4 turns, uid+ticker scoped
    model_pro: str | None              # overrides config.model_pro (from Remote Config)
    model_flash: str | None            # overrides config.model_flash (from Remote Config)
    model_flash_lite: str | None       # overrides config.model_flash_lite (from Remote Config)

    # ── Guardian classifier output ───────────────────────────────────────────
    classification: dict | None        # raw guardian tool_use output
    references_different_company: bool # true → query is primarily about another company
    referenced_ticker: str | None      # ticker of referenced company (untrusted — validate before FMP use)
    required_data_categories: list[str] | None # e.g. ["NEWS", "PRICE_PERFORMANCE"]

    # ── Routing ──────────────────────────────────────────────────────────────
    route_path: str | None             # exit|ambassador|doc_summary|fmp|fallback|error

    # ── FMP / ambassador path ────────────────────────────────────────────────
    fmp_company_profile: dict | None   # profile data fetched by ambassador_fmp_call
    fmp_result: str | None             # stock query FMP result text
    fmp_error: str | None
    fmp_available: bool                # circuit breaker gate — closed=True, open=False
    ambassador_used_fmp_data: bool     # true if ambassador_llm_node had FMP data

    # ── Tavily fallback path ─────────────────────────────────────────────────
    tavily_result: str | None
    tavily_error: str | None

    # ── Response construction ────────────────────────────────────────────────
    raw_response: str | None           # unsanitized LLM response text
    sanitized_response: str | None     # after response_sanitizer
    follow_ups: list[str]              # 3 contextual follow-up questions
    final_response: str | None         # assembled final message for client

    # ── Metadata ─────────────────────────────────────────────────────────────
    source: str | None                 # fmp|tavily|fmp_profile|llm_knowledge|static
    comparison_mode: bool              # true when references_different_company=true
    retry_after_seconds: int | None    # only on error path

    # ── Observability ────────────────────────────────────────────────────────
    metadata: dict                     # start_time, fmp_attempted, fallback_source,
                                       # estimated_token_cost, latency_ms
