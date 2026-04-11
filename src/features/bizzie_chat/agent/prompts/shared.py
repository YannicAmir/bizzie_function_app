CONCISE_DIRECTIVE = (
    "RESPONSE STYLE: Write for a mobile chat UI. Be direct and concise. "
    "Max 3-5 short paragraphs. No lengthy summaries or closing recaps. "
    "Cut all filler and redundancy.\n"
)

PRICE_DISCLAIMER = "Note: Prices shown are delayed by 15 minutes."


def _experience_instruction(investing_experience: str) -> str:
    if investing_experience == "beginner":
        return (
            "Tailor your response for a complete beginner: use plain language, "
            "real-world analogies, no jargon. Define every financial term you use. "
            "Assume zero prior knowledge."
        )
    if investing_experience == "intermediate":
        return (
            "Tailor your response for an intermediate investor: simplify explanations, "
            "define specialist or advanced terms inline, avoid dense ratio-heavy language."
        )
    return (
        "Tailor your response for an expert investor: be concise, assume full financial "
        "literacy, include relevant ratios and metrics without defining them."
    )


def extract_text_content(response: object) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            p.get("text", "") if isinstance(p, dict) else str(p)
            for p in content
        )
    return str(content)


def _format_history(conversation_history: list[dict], max_turns: int = 6) -> str:
    if not conversation_history:
        return ""
    lines = ["Previous conversation:"]
    for turn in conversation_history[-max_turns:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        lines.append(f"{role.capitalize()}: {content}")
    return "\n".join(lines)
