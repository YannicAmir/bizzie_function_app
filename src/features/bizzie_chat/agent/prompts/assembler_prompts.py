FOLLOW_UP_SYSTEM = "You are a helpful investment assistant that only speaks in JSON arrays."


def build_follow_up_prompt(
    company_name: str,
    company_ticker: str,
    references_different: bool,
    referenced_ticker: str | None,
) -> str:
    if references_different and referenced_ticker:
        return (
            f"The user asked about {company_name} ({company_ticker}) in context of comparing with "
            f"{referenced_ticker}. "
            "Generate exactly 3 short, 1-sentence follow-up questions for a curious investor. "
            "Return as a JSON array of strings: [\"question 1\", \"question 2\", \"question 3\"]"
        )
    return (
        f"Based on a question about {company_name} ({company_ticker}), "
        "generate exactly 3 short, 1-sentence follow-up questions for a curious investor. "
        "Return as a JSON array of strings: [\"question 1\", \"question 2\", \"question 3\"]"
    )
