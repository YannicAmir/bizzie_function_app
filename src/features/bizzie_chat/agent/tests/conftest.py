"""
Shared pytest fixtures for bizzie_chat agent DeepEval tests.

Usage:
    APP_ENV=dev deepeval test run tests/ -n 10 -id "dev-sprint-01"
"""

import os
import sys
from pathlib import Path

import deepeval
import pytest
from dotenv import load_dotenv

# Repo root is 5 levels up: tests/ -> agent/ -> bizzie_chat/ -> features/ -> src/ -> root
_REPO_ROOT = Path(__file__).parents[5]
sys.path.insert(0, str(_REPO_ROOT))


def pytest_configure(config: pytest.Config) -> None:
    """
    Load environment variables before the first test is collected.

    Load order (later files override earlier ones):
      1. .env              (base configuration)
      2. .env.{APP_ENV}    (environment-specific project names)
      3. .secret.local     (at root — mirrors GCP secrets, contains API keys)
      4. .env.local        (personal/local overrides)
    """
    agent_dir = Path(__file__).parent.parent
    root_dir = _REPO_ROOT
    env_name = os.getenv("APP_ENV", "dev")

    load_dotenv(agent_dir / ".env")
    load_dotenv(agent_dir / f".env.{env_name}", override=True)
    load_dotenv(root_dir / ".secret.local", override=True)
    load_dotenv(root_dir / ".env.local", override=True)
    load_dotenv(agent_dir / ".env.local", override=True)

    confident_api_key = os.getenv("CONFIDENT_API_KEY")
    if confident_api_key:
        deepeval.login(confident_api_key)


@pytest.fixture(scope="session")
def graph():
    """Compile the LangGraph agent once for the entire test session."""
    from src.features.bizzie_chat.agent.graph import build_graph
    return build_graph(checkpointer=None)


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


@pytest.fixture(scope="session")
def judge_model():
    """
    The LLM DeepEval uses to judge agent outputs.

    Defaults to gemini-3-flash-preview on global Vertex AI for local runs.
    In CI, DEEPEVAL_JUDGE_MODEL and DEEPEVAL_JUDGE_LOCATION are set explicitly
    to use a stable GA model (gemini-2.5-flash-lite at us-central1).
    """
    from deepeval.models import GeminiModel

    model_id = os.getenv("DEEPEVAL_JUDGE_MODEL", "gemini-3-flash-preview")
    project = os.getenv("GCLOUD_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("DEEPEVAL_JUDGE_LOCATION", "global")

    return GeminiModel(
        model=model_id,
        project=project,
        location=location,
        use_vertexai=True,
    )
