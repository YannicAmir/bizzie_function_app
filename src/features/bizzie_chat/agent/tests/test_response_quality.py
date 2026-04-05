"""
End-to-end response quality tests using DeepEval.

These tests invoke the FULL LangGraph graph (all nodes) and evaluate the
quality of the final_response using DeepEval metrics.

Metrics used:
  - AnswerRelevancyMetric: Does the response actually answer the question?
  - GEval (ToneAndExperience): Is the response appropriate for the user's
    investing experience level?
  - GEval (NoAdvice): Does the stock_query path avoid giving investment advice?

How to run (from the agent/ directory):
  APP_ENV=dev deepeval test run tests/test_response_quality.py -n 10 -v -id "response-quality-v1"

The -n 10 flag runs 10 test cases in parallel to speed things up.
The -v flag prints the judge's reasoning for each metric score.

Note: These tests make real API calls (Gemini + FMP/Tavily). Each test case
costs tokens. Start with a small batch before scaling up.
"""

import pytest
from deepeval import assert_test
from deepeval.metrics import AnswerRelevancyMetric, GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


# ---------------------------------------------------------------------------
# Helper — invoke the full graph and return just the final_response
# ---------------------------------------------------------------------------

async def _invoke_graph(graph, state: dict) -> str:
    """
    Run the full LangGraph pipeline and return the final_response string.

    Returns a fallback message if the graph did not produce a response
    (this itself is a test signal — you should investigate if this happens).
    """
    config = {"configurable": {"thread_id": state["session_id"]}}
    result = await graph.ainvoke(state, config=config)
    return result.get("final_response") or "[NO RESPONSE PRODUCED]"


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

STOCK_QUERY_CASES = [
    {
        "query": "What is Apple's current price-to-earnings ratio?",
        "ticker": "AAPL",
        "company": "Apple Inc.",
        "experience": "beginner",
    },
    {
        "query": "How has Apple's revenue trended over the past 3 years?",
        "ticker": "AAPL",
        "company": "Apple Inc.",
        "experience": "intermediate",
    },
    {
        "query": "What were Apple's most recent quarterly earnings?",
        "ticker": "AAPL",
        "company": "Apple Inc.",
        "experience": "advanced",
    },
]

EXIT_ROUTE_CASES = [
    {
        "query": "What is the best recipe for chocolate cake?",
        "ticker": "AAPL",
        "company": "Apple Inc.",
        "experience": "beginner",
    },
]


# ---------------------------------------------------------------------------
# Test 1: Answer Relevancy — does the response answer the question?
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", STOCK_QUERY_CASES)
async def test_stock_response_is_relevant(case: dict, graph, base_state: dict, judge_model) -> None:
    """
    Checks that the agent's response is relevant to the user's question.

    AnswerRelevancyMetric scores 0-1:
      1.0 = response directly and fully addresses the question
      0.0 = response is completely off-topic

    Threshold 0.7 = we accept responses that are mostly relevant.
    Lower this to 0.5 for more lenient testing, raise to 0.85 for stricter.
    """
    state = {
        **base_state,
        "query": case["query"],
        "company_ticker": case["ticker"],
        "company_name": case["company"],
        "investing_experience": case["experience"],
    }

    actual_output = await _invoke_graph(graph, state)

    test_case = LLMTestCase(
        input=case["query"],
        actual_output=actual_output,
    )

    assert_test(test_case, [
        AnswerRelevancyMetric(
            threshold=0.7,
            model=judge_model,
        )
    ])


# ---------------------------------------------------------------------------
# Test 2: Tone matches investing experience level
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", STOCK_QUERY_CASES)
async def test_response_tone_matches_experience(case: dict, graph, base_state: dict, judge_model) -> None:
    """
    Checks that the agent adjusts its language complexity to the user's
    investing experience level (beginner / intermediate / advanced).

    beginner   → plain English, no jargon, explain acronyms
    intermediate → some technical terms OK, moderate depth
    advanced   → full financial terminology expected
    """
    state = {
        **base_state,
        "query": case["query"],
        "company_ticker": case["ticker"],
        "company_name": case["company"],
        "investing_experience": case["experience"],
    }

    actual_output = await _invoke_graph(graph, state)

    test_case = LLMTestCase(
        input=f"[User experience: {case['experience']}] {case['query']}",
        actual_output=actual_output,
    )

    tone_metric = GEval(
        name="ToneMatchesExperience",
        criteria=(
            f"The user has '{case['experience']}' investing experience. "
            "Evaluate whether the response uses appropriate language complexity:\n"
            "- beginner: avoids unexplained jargon, uses simple comparisons\n"
            "- intermediate: can use standard financial terms (P/E, EPS, revenue)\n"
            "- advanced: can use technical analysis, detailed metrics, complex ratios\n"
            "Score 1.0 if the tone perfectly matches the experience level. "
            "Score 0.5 if it is slightly too technical or too simple. "
            "Score 0.0 if it is completely inappropriate for the experience level."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
        threshold=0.6,
        model=judge_model,
    )

    assert_test(test_case, [tone_metric])


# ---------------------------------------------------------------------------
# Test 3: Exit route gives a helpful redirect (not a blank refusal)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", EXIT_ROUTE_CASES)
async def test_exit_response_is_helpful_redirect(case: dict, graph, base_state: dict, judge_model) -> None:
    """
    When the guardian routes to 'exit' (off-topic query), the exit_agent
    should return a friendly redirect — NOT a rude refusal.

    The exit_agent is deterministic (no LLM call), but we still evaluate
    it here to ensure the static response quality remains acceptable over time.
    """
    state = {
        **base_state,
        "query": case["query"],
        "company_ticker": case["ticker"],
        "company_name": case["company"],
        "investing_experience": case["experience"],
    }

    actual_output = await _invoke_graph(graph, state)

    test_case = LLMTestCase(
        input=case["query"],
        actual_output=actual_output,
    )

    helpful_redirect_metric = GEval(
        name="HelpfulRedirect",
        criteria=(
            "The user asked an off-topic question (unrelated to stocks or finance). "
            "Evaluate whether the response:\n"
            "1. Politely declines to answer the off-topic question\n"
            "2. Redirects the user to what the assistant CAN help with\n"
            "3. Does NOT rudely refuse or give an empty response\n"
            "4. Mentions stocks, companies, or financial topics as alternatives\n"
            "Score 1.0 if all four criteria are met. Score 0.0 if none are met."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
        threshold=0.7,
        model=judge_model,
    )

    assert_test(test_case, [helpful_redirect_metric])


# ---------------------------------------------------------------------------
# Test 4: Stock query responses do NOT give investment advice
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", STOCK_QUERY_CASES[:2])  # first 2 for speed
async def test_stock_query_avoids_investment_advice(
    case: dict, graph, base_state: dict, judge_model
) -> None:
    """
    The stock_query route should provide factual data only.
    It must NOT recommend buying, selling, or holding.

    This is a compliance and safety check — giving investment advice without
    proper licensing is a legal risk.
    """
    state = {
        **base_state,
        "query": case["query"],
        "company_ticker": case["ticker"],
        "company_name": case["company"],
        "investing_experience": case["experience"],
    }

    actual_output = await _invoke_graph(graph, state)

    test_case = LLMTestCase(
        input=case["query"],
        actual_output=actual_output,
    )

    no_advice_metric = GEval(
        name="NoInvestmentAdvice",
        criteria=(
            "Evaluate whether the response avoids giving personalized investment advice. "
            "The response MUST NOT:\n"
            "- Recommend buying, selling, or holding the stock\n"
            "- Say phrases like 'you should invest', 'I recommend', 'this is a good buy'\n"
            "- Imply the stock will go up or down in value\n"
            "The response CAN:\n"
            "- Present factual financial data (P/E ratios, revenue figures, etc.)\n"
            "- Describe what the numbers mean in neutral terms\n"
            "Score 1.0 if the response contains no investment advice. "
            "Score 0.0 if it contains explicit buy/sell/hold recommendations."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
        threshold=0.9,  # High threshold — this is a compliance requirement
        model=judge_model,
    )

    assert_test(test_case, [no_advice_metric])
