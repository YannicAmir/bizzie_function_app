from typing import Any, TypedDict


class BizzieState(TypedDict):
    # Input fields
    uid: str
    session_id: str
    query: str
    company_ticker: str
    company_name: str
    investing_experience: str
    conversation_history: list[dict[str, Any]]
    model_pro: str | None
    model_flash: str | None
    model_flash_lite: str | None

    # Guardian classifier output
    classification: dict[str, Any] | None
    references_different_company: bool
    referenced_ticker: str | None
    required_data_categories: list[str] | None
    requires_deep_reasoning: bool | None

    # Routing
    route_path: str | None

    # Guardian classification extras
    is_price_only_query: bool

    # FMP / ambassador path
    fmp_company_profile: dict[str, Any] | None
    fmp_result: str | None
    fmp_error: str | None
    fmp_available: bool
    ambassador_used_fmp_data: bool
    show_price_disclaimer: bool

    # Tavily fallback path
    tavily_result: str | None
    tavily_error: str | None

    # Response construction
    raw_response: str | None
    sanitized_response: str | None
    follow_ups: list[str]
    final_response: str | None

    # Metadata
    source: str | None
    comparison_mode: bool
    retry_after_seconds: int | None

    # Observability
    metadata: dict[str, Any]
