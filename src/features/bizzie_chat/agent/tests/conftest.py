"""
Shared pytest fixtures for bizzie_chat agent DeepEval tests.

What this file does:
- Adds the repo root to Python's import path so `from src.features...` imports work
- Loads the correct .env.{APP_ENV} file before tests run
- Provides a compiled LangGraph graph fixture (built once, shared across all tests)
- Provides a base_state fixture with sensible defaults
- Provides the DeepEval judge model (uses Gemini Vertex AI — same as the agent itself)

Usage:
    APP_ENV=dev deepeval test run tests/ -n 2 -id "dev-sprint-01"
"""

import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Path setup — must happen before any src.features.* imports
# ---------------------------------------------------------------------------
# This file lives at: agent/tests/conftest.py
# The repo root is 5 levels up: tests/ -> agent/ -> bizzie_chat/ -> features/ -> src/ -> root
_REPO_ROOT = Path(__file__).parents[5]
sys.path.insert(0, str(_REPO_ROOT))


def pytest_configure(config: pytest.Config) -> None:
    """
    Load environment variables before the first test is collected.
    Called automatically by pytest — no need to add to any fixture.

    Load order (later files override earlier ones):
      1. .env             (base values shared across all envs)
      2. .env.{APP_ENV}   (env-specific values — sets CONFIDENT_API_KEY)
      3. .env.local       (personal overrides, never committed)
    Process environment variables always win over any dotenv file.

    To switch environments:
      APP_ENV=qa deepeval test run tests/
      APP_ENV=prod deepeval test run tests/
    """
    agent_dir = Path(__file__).parent.parent
    env_name = os.getenv("APP_ENV", "dev")

    load_dotenv(agent_dir / ".env", override=False)
    load_dotenv(agent_dir / f".env.{env_name}", override=False)
    load_dotenv(agent_dir / ".env.local", override=False)


# ---------------------------------------------------------------------------
# Graph fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def graph():
    """
    Compile the LangGraph agent once for the entire test session.

    scope="session" means this runs only once no matter how many tests use it.
    That keeps tests fast — graph compilation is expensive.
    """
    from src.features.bizzie_chat.agent.graph import build_graph
    return build_graph(checkpointer=None)


# ---------------------------------------------------------------------------
# State fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_state() -> dict:
    """
    Minimal valid BizzieState for tests.

    Override specific fields in each test:
        def test_something(base_state):
            state = {**base_state, "query": "What is Apple's P/E ratio?"}
    """
    return {
        "uid": "test-user-001",
        "session_id": "test-session-001",
        "query": "",                      # override per test
        "company_ticker": "AAPL",
        "company_name": "Apple Inc.",
        "investing_experience": "intermediate",
        "conversation_history": [],
        "model_pro": None,                # None = use config default
        "model_flash": None,
        "model_flash_lite": None,
        "fmp_available": True,
        "metadata": {},
    }


# ---------------------------------------------------------------------------
# DeepEval judge model
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def judge_model():
    """
    The LLM DeepEval uses to judge your agent's outputs.

    Uses Gemini Vertex AI — the same model provider as the agent itself.
    No extra API keys required beyond what you already have for running the agent.

    Requirements:
      - GCLOUD_PROJECT must be set (already in your .env.local)
      - GCP auth must be active: run `gcloud auth application-default login`
        OR set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

    Gemini 2.0 Flash is a good balance of speed and quality for evaluation.
    You can change the model_name to any Gemini model your project has access to.
    """
    from deepeval.models import GeminiVertexAI

    return GeminiVertexAI(
        model_name="gemini-2.0-flash",
        project_id=os.getenv("GCLOUD_PROJECT", ""),
        location=os.getenv("GCP_LOCATION", "us-central1"),
    )
