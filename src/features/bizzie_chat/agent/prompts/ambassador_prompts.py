import json
from typing import Any

from src.features.bizzie_chat.agent.prompts.shared import (
    CONCISE_DIRECTIVE,
    PRICE_DISCLAIMER,
    _experience_instruction,
)
from src.features.bizzie_chat.agent.state import BizzieState


def build_ambassador_prompt(
    state: BizzieState,
    has_fmp_data: bool,
    fmp_profile: dict[str, Any] | None,
) -> str:
    company_name = state["company_name"]
    company_ticker = state["company_ticker"]
    referenced_ticker = state.get("referenced_ticker")
    experience = state.get("investing_experience", "intermediate")
    references_different = state.get("references_different_company", False)
    experience_block = _experience_instruction(experience)
    query = state["query"]
    profile = fmp_profile or {}

    if not references_different and has_fmp_data:
        fmp_summary = json.dumps(profile.get(company_ticker, profile), indent=2)[:2000]
        return (
            CONCISE_DIRECTIVE +
            f"The user is asking about {company_name} ({company_ticker}) but has requested investment advice. "
            "Bizzie does not provide investment advice. Instead:\n"
            "1. Acknowledge that Bizzie doesn't give buy/sell/hold recommendations.\n"
            f"2. Provide a factual company overview grounded in this FMP data:\n{fmp_summary}\n"
            "3. Suggest 3-4 specific financial questions the user could research to evaluate the company "
            "(e.g., revenue growth, free cash flow, debt levels, margins, P/E ratio).\n"
            f"4. If you reference the current or most recent stock price in your response, "
            f"append exactly: '{PRICE_DISCLAIMER}'\n\n"
            f"{experience_block}\n\nUser query: {query}"
        )

    if not references_different:
        return (
            CONCISE_DIRECTIVE +
            f"The user is asking about {company_name} ({company_ticker}) but has requested investment advice. "
            "Bizzie does not provide investment advice. Instead:\n"
            "1. Acknowledge that Bizzie doesn't give buy/sell/hold recommendations.\n"
            f"2. Provide a factual company overview of {company_name} based on your training knowledge.\n"
            "3. Suggest 3-4 specific financial questions the user could research.\n"
            "End with exactly this disclaimer: "
            '"Note: the company overview above is based on general background knowledge '
            'and may not reflect the most current information."\n\n'
            f"{experience_block}\n\nUser query: {query}"
        )

    if has_fmp_data:
        fmp_current = json.dumps(profile.get(company_ticker, {}), indent=2)[:1000]
        fmp_ref = json.dumps(profile.get(referenced_ticker, {}), indent=2)[:1000] if referenced_ticker else ""
        ref_name = referenced_ticker or "the referenced company"
        return (
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
            f"{experience_block}\n\nUser query: {query}"
        )

    ref_name = referenced_ticker or "the referenced company"
    return (
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
        f"{experience_block}\n\nUser query: {query}"
    )