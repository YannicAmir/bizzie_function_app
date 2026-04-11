# Cost Evaluation: bizzie_chat Agentic System

This document provides a detailed financial analysis of the `bizzie_chat` LangGraph system. It covers LLM token usage for Gemini 3 / 3.1 models, API call costs for FMP and Tavily, and projections for monthly operational expenses.

---

## 1. Model Pricing Reference (Vertex AI - March 2026)

The system is configured to use the following models. Pricing is per 1 million (1M) tokens.

| Model Tier | Deployment Variable | Input Price (≤200K) | Output Price |
| :--- | :--- | :--- | :--- |
| **Gemini 3.1 Pro** | `model_pro` | $2.00 | $12.00 |
| **Gemini 3 Flash** | `model_flash` | $0.50 | $3.00 |
| **Gemini 3.1 Flash-Lite** | `model_flash_lite` | $0.25 | $1.50 |

> [!NOTE]
> For context > 200,000 tokens, prices typically double for both input and output.

---

## 2. Path-by-Path Breakdown

### Path 1: Off-topic / Static Redirects
*   **Nodes**: `guardian_classifier` -> `exit_agent` / `price_redirect_agent`
*   **Structure**: 1x LLM Call | 0x API Calls
*   **LLM Model**: 3.1 Flash-Lite
*   **Token Average**: 650 In / 50 Out
*   **Cost per Run**:
    *   Full: **$0.0002375** (~$0.24 per 1k)
    *   Output-only: **$0.000075** (~$0.08 per 1k)

### Path 2: Ambassador (Investment Advice Redirect)
*   **Nodes**: `guardian_classifier` -> `ambassador_llm_node` -> `follow_up_generator`
*   **Structure**: 3x LLM Calls | 1x API Call (FMP Profile)
*   **LLM Models**: 2x Flash-Lite, 1x Flash
*   **Token Average**: (950 Lite In / 100 Lite Out) + (2,500 Flash In / 300 Flash Out)
*   **Cost per Run**:
    *   Full: **$0.0025375** (~$2.54 per 1k)
    *   Output-only: **$0.00105** (~$1.05 per 1k)

### Path 3: Standard Stock Query (FMP Happy Path)
*   **Nodes**: `guardian_classifier` -> `fmp_agent` (Plan + Synth) -> `follow_up_generator`
*   **Structure**: 4x LLM Calls | 3-5x API Calls (FMP Tools)
*   **LLM Models**: 4x Flash-Lite
*   **Token Average**: 5,000 In / 650 Out
*   **Cost per Run**:
    *   Full: **$0.002225** (~$2.23 per 1k)
    *   Output-only: **$0.000975** (~$0.98 per 1k)

### Path 4: Comparison / Deep Reasoning (**Most Expensive**)
*   **Nodes**: `guardian_classifier` -> `fmp_agent` (Pro Plan + Pro Synth) -> `follow_up_generator`
*   **Structure**: 4x LLM Calls | 8+ API Calls (FMP Tools)
*   **LLM Models**: 2x Flash-Lite, 2x Pro
*   **Token Average**: (950 Lite In / 100 Lite Out) + (7,000 Pro In / 800 Pro Out)
*   **Cost per Run**:
    *   Full: **$0.0239875** (~$23.99 per 1k)
    *   Output-only: **$0.00975** (~$9.75 per 1k)

### Path 5: Tavily Fallback (FMP Error/Circuit Breaker)
*   **Nodes**: `guardian_classifier` -> `tavily_fallback_agent` (Loop x2) -> `follow_up_generator`
*   **Structure**: 4x LLM Calls | 1-2x API Calls (Tavily Search)
*   **LLM Models**: 2x Flash-Lite, 2x Flash
*   **Token Average**: (950 Lite In / 100 Lite Out) + (4,500 Flash In / 500 Flash Out)
*   **Cost per Run**:
    *   Full: **$0.0041375** (~$4.14 per 1k)
    *   Output-only: **$0.00165** (~$1.65 per 1k)

---

## 3. Monthly Projections (10,000 Messages)

Based on a hypothetical distribution of query types:

| Path Type | Popularity | Cost per Run | Monthly Total |
| :--- | :--- | :--- | :--- |
| Standard Stock Query | 80% | $0.002225 | $17.80 |
| Ambassador | 10% | $0.0025375 | $2.54 |
| Deep Reasoning/Pro | 5% | $0.0239875 | $11.99 |
| Off-topic | 5% | $0.0002375 | $0.12 |
| **Total ESTIMATED** | **100%** | | **$32.45 / month** |

---

## 4. Context Caching Analysis

Vertex AI **Context Caching** is effective when the same system prompt and long history (e.g., > 10 turns) are reused across multiple calls in a session.

### Scenario: 10,000 tokens of conversation history
Without caching, every turn re-reads the 10,000 tokens. With caching, you pay a "Cache Hit" rate.

| Metric | Without Caching (3.1 Pro) | With Caching (3.1 Pro) | Savings |
| :--- | :--- | :--- | :--- |
| Input Price (1M) | $2.00 | $0.20 | **90%** |
| Cost for 10k history | $0.02 | $0.002 | -- |

> [!TIP]
> Caching also incurs a storage fee of **$4.50 per 1M tokens per hour**. For `bizzie_chat`, caching is only economical for sessions with **highly frequent follow-up questions** (at least 3-4 per minute).

---

## 5. Optimal vs. Most Expensive Path

*   **Optimal Path (Efficiency)**: **Standard Stock Query** via Flash-Lite. It achieves "Agentic" behavior (Plan + Tool Use + Synth) while staying within the lowest pricing tier.
*   **Most Expensive Path**: **Deep Reasoning** via Pro tier. The cost jump from Flash-Lite to Pro is ~10x. This path should only be triggered for high-value financial comparisons.

---

## 6. Recommendations

1.  **Strict Tiering**: Ensure the `guardian_classifier` only escalates to `requires_deep_reasoning = True` when absolutely necessary (e.g., comparing 2+ companies).
2.  **History Trimming**: Implement a sliding window for `conversation_history` (e.g., last 5 turns) to keep input token counts low without needing expensive context caching.
3.  **FMP Caching**: Use the `profile-symbol` tool sparingly as it returns a large JSON blob; better to fetch once and store in `BizzieState` (as currently implemented in Ambassador).
