"""
Dataset-driven smoke test suite for the bizzie_chat agent.

Test cases are managed in Confident AI (alias: "bizzie-smoke-tests").
To add, edit, or remove test cases — update create_dataset.py and re-run it.
No changes to this file are needed.

Run:
    APP_ENV=dev deepeval test run src/features/bizzie_chat/agent/tests/test_smoke.py -n 10
"""

import os
from pathlib import Path
from typing import cast

import deepeval
import pytest
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from dotenv import load_dotenv

# Load env + authenticate before pulling dataset.
# `deepeval test run` imports test modules before pytest_configure fires,
# so both env loading and deepeval.login() must happen here — not just in
# conftest.py — to ensure the dataset pull is fully authenticated.
_REPO_ROOT = Path(__file__).parents[5]
_AGENT_DIR = Path(__file__).parent.parent
_ENV_NAME = os.getenv("APP_ENV", "dev")

load_dotenv(_AGENT_DIR / ".env")
load_dotenv(_AGENT_DIR / f".env.{_ENV_NAME}", override=True)
load_dotenv(_REPO_ROOT / ".secret.local", override=True)
load_dotenv(_REPO_ROOT / ".env.local", override=True)
load_dotenv(_AGENT_DIR / ".env.local", override=True)

_confident_api_key = os.getenv("CONFIDENT_API_KEY")
if _confident_api_key:
    deepeval.login(_confident_api_key)

# Pull dataset — happens once at collection time
_PARAM_MAP = {
    "INPUT": LLMTestCaseParams.INPUT,
    "ACTUAL_OUTPUT": LLMTestCaseParams.ACTUAL_OUTPUT,
    "EXPECTED_OUTPUT": LLMTestCaseParams.EXPECTED_OUTPUT,
    "RETRIEVAL_CONTEXT": LLMTestCaseParams.RETRIEVAL_CONTEXT,
}

_dataset = EvaluationDataset()
_dataset.pull(alias="bizzie-chat-tests")
_goldens: list[Golden] = cast(list[Golden], _dataset.goldens)


async def run_graph(graph, state):
    """Invoke the graph and extract the final response and route."""
    res = await graph.ainvoke(state)
    return {
        "output": res.get("final_response") or res.get("raw_response"),
        "route": res.get("route_path"),
        "classification": res.get("classification"),
    }


@pytest.mark.parametrize(
    "golden",
    _goldens,
    ids=[
        (g.additional_metadata or {}).get("eval_name", g.input[:40])
        for g in _goldens
    ],
)
@pytest.mark.asyncio
async def test_bizzie_chat(golden, graph, base_state, judge_model):
    meta = golden.additional_metadata or {}

    # Build graph state — golden metadata overrides base defaults
    state = {
        **base_state,
        "query": golden.input,
        "company_ticker": meta.get("company_ticker", base_state["company_ticker"]),
        "company_name": meta.get("company_name", base_state["company_name"]),
    }

    result = await run_graph(graph, state)

    # Structural assertion: route must be (one of) the expected value(s)
    assert_route = meta.get("assert_route")
    if assert_route is not None:
        if isinstance(assert_route, list):
            assert result["route"] in assert_route, (
                f"Expected route in {assert_route}, got '{result['route']}'\n"
                f"Input: {golden.input}"
            )
        else:
            assert result["route"] == assert_route, (
                f"Expected route '{assert_route}', got '{result['route']}'\n"
                f"Input: {golden.input}"
            )

    # Structural assertion: route must NOT be a specific value
    assert_route_not = meta.get("assert_route_not")
    if assert_route_not:
        assert result["route"] != assert_route_not, (
            f"Route must NOT be '{assert_route_not}' for this query, but it was.\n"
            f"Input: {golden.input}"
        )

    # Structural assertion: guardian classification fields
    assert_classification = meta.get("assert_classification")
    if assert_classification:
        classification = result.get("classification") or {}
        for field, expected_value in assert_classification.items():
            assert classification.get(field) == expected_value, (
                f"Expected classification[{field!r}] = {expected_value!r}, "
                f"got {classification.get(field)!r}\n"
                f"Input: {golden.input}"
            )

    retrieval_context = meta.get("retrieval_context")
    test_case = LLMTestCase(
        input=golden.input,
        actual_output=result["output"],
        expected_output=golden.expected_output,
        retrieval_context=retrieval_context,
    )

    eval_params = [
        _PARAM_MAP[p]
        for p in meta.get("eval_params", ["INPUT", "ACTUAL_OUTPUT"])
    ]

    metric = GEval(
        name=meta.get("eval_name", "QualityCheck"),
        criteria=meta["eval_criteria"],
        evaluation_params=eval_params,
        threshold=meta.get("threshold", 0.7),
        model=judge_model,
    )

    assert_test(test_case, [metric])
