from src.features.bizzie_chat.agent.prompts.shared import (
    CONCISE_DIRECTIVE,
    _experience_instruction,
)


def build_tavily_system(
    company_name: str,
    company_ticker: str,
    experience: str,
    references_different: bool,
    referenced_ticker: str | None,
) -> str:
    if references_different and referenced_ticker:
        return (
            CONCISE_DIRECTIVE +
            f"You are a financial assistant. The user is viewing {company_name} ({company_ticker}). "
            f"They are asking about {referenced_ticker}. Treat this as a comparison. "
            "Use Tavily to search for relevant information. "
            "Structure: (1) briefly answer about the referenced company, (2) pivot to the current company. "
            "Always end with: 'Note: this data is sourced from web search and may not reflect real-time figures.' "
            f"\n\n{_experience_instruction(experience)}"
        )
    return (
        CONCISE_DIRECTIVE +
        f"You are a financial assistant. The user is asking about {company_name} ({company_ticker}). "
        "Use Tavily to search for the most current relevant information. "
        "Always end with: 'Note: this data is sourced from web search and may not reflect real-time figures.' "
        f"\n\n{_experience_instruction(experience)}"
    )
