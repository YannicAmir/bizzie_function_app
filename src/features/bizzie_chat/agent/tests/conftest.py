"""
Shared pytest fixtures for bizzie_chat agent DeepEval tests.

What this file does:
- Adds the repo root to Python's import path so `from src.features...` imports work
- Loads the correct .env.{APP_ENV} file before tests run
- Provides a compiled LangGraph graph fixture (built once, shared across all tests)
- Provides a base_state fixture with sensible defaults
- Provides the DeepEval judge model (uses Gemini Vertex AI — same as the agent itself)

Usage:
    APP_ENV=dev deepeval test run tests/ -n 10 -id "dev-sprint-01"
"""

import os
import sys
from pathlib import Path

import deepeval
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
      1. .env              (base configuration)
      2. .env.{APP_ENV}    (environment-specific project names)
      3. .secret.local     (at root — mirrors GCP secrets, contains API keys)
      4. .env.local        (personal/local overrides)
    """
    agent_dir = Path(__file__).parent.parent
    root_dir = _REPO_ROOT
    env_name = os.getenv("APP_ENV", "dev")

    # 1. Base
    load_dotenv(agent_dir / ".env")
    # 2. Env-specific (dev/prod)
    load_dotenv(agent_dir / f".env.{env_name}", override=True)
    # 3. Secret mirror (mirrors GCP Secrets)
    load_dotenv(root_dir / ".secret.local", override=True)
    # 4. Overrides
    load_dotenv(root_dir / ".env.local", override=True)
    load_dotenv(agent_dir / ".env.local", override=True)

    # Authenticate with Confident AI if key is available (handles CI where deepeval login is not run)
    confident_api_key = os.getenv("CONFIDENT_API_KEY")
    if confident_api_key:
        deepeval.login(confident_api_key)


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
    """Matches the confirmed BizzieState input schema."""
    return {
        "uid": "user_123",
        "session_id": "session_456",
        "query": "",  # overridden in tests
        "company_ticker": "INTU",
        "company_name": "Intuit Inc.",
        "investing_experience": "expert",
        "conversation_history": [],
        "metadata": {},
    }


# ---------------------------------------------------------------------------
# DeepEval judge model
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def judge_model():
    """
    The LLM DeepEval uses to judge your agent's outputs.

    Uses the latest Gemini models via Vertex AI (Global Endpoint).
    Note: Gemini 3.1 preview models currently require the 'global' location on Vertex AI.
    """
    from deepeval.models import GeminiModel

    model_id = os.getenv("DEEPEVAL_JUDGE_MODEL", "gemini-3.1-flash-lite-preview")
    project = os.getenv("GCLOUD_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")

    return GeminiModel(
        model=model_id,
        project=project,
        location="global",
        use_vertexai=True,
    )
