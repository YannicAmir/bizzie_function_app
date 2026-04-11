from src.features.bizzie_chat.agent.prompts.shared import (
    CONCISE_DIRECTIVE,
    _experience_instruction,
)


def build_plan_system(
    company_name: str,
    company_ticker: str,
    today_str: str,
    tool_schema_summary: str,
    references_different: bool,
    referenced_ticker: str | None,
) -> str:
    if references_different and referenced_ticker:
        return (
            f"You are a financial research planner. The user is viewing {company_name} ({company_ticker}) "
            f"and asking about {referenced_ticker} for comparison. Today: {today_str}.\n"
            f"Your ONLY job is to output a JSON array of tool calls needed to answer the query. "
            f"Use tools for BOTH {company_ticker} AND {referenced_ticker}. "
            f"Limit news to 15 articles max.\n\n"
            f"Available tools:\n{tool_schema_summary}\n\n"
            f"Output ONLY valid JSON array, no other text. Format: "
            f'[{{"tool": "tool-name", "args": {{"symbol": "UBER", ...}}}}]'
        )
    return (
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


def build_synth_system(
    company_name: str,
    company_ticker: str,
    today_str: str,
    experience: str,
    references_different: bool,
    referenced_ticker: str | None,
) -> str:
    if references_different and referenced_ticker:
        return (
            CONCISE_DIRECTIVE +
            f"You are a world-class financial analyst. The user is viewing {company_name} ({company_ticker}) "
            f"and asked about {referenced_ticker}. Today: {today_str}.\n"
            f"Structure the response: (1) briefly cover {referenced_ticker} (2-3 sentences), "
            f"(2) pivot to {company_ticker} in depth. "
            f"If you used knowledge for {referenced_ticker}, append: "
            f"'Note: information about {referenced_ticker} is based on general knowledge "
            f"and may not reflect the most current data.'\n"
            f"{_experience_instruction(experience)}"
        )
    return (
        CONCISE_DIRECTIVE +
        f"You are a world-class financial analyst. You are answering a question about "
        f"{company_name} ({company_ticker}). Today: {today_str}.\n"
        f"Synthesize the research data into a direct, narrative answer. "
        f"Explain the 'why', not just the 'what'.\n"
        f"{_experience_instruction(experience)}"
    )


def build_synth_user(research_blocks: str, query: str) -> str:
    return (
        f"RESEARCH DATA:\n{research_blocks}\n\n"
        f"USER QUESTION: {query}\n\n"
        f"Write the final answer now:"
    )


def build_manual_summary_system(company_name: str, company_ticker: str, today_date_str: str) -> str:
    return (
        f"You are a financial analyst. Synthesize the following research data for "
        f"{company_name} ({company_ticker}) into a direct answer. "
        f"Today's Date: {today_date_str}."
    )


def build_manual_summary_user(mega_research_text: str, query: str) -> str:
    return (
        f"RESEARCH DATA:\n{mega_research_text}\n\n"
        f"USER QUESTION: {query}\n\nProvide the final answer now:"
    )
