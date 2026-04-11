# DeepEval Setup — Automated Setup Workflow

Automated setup of DeepEval + Confident AI for the Python LangGraph agent layer.
This agent handles all steps that do not require a browser or an external account — it guides the user through those manual steps at the end.

Always read first:
- `.claude/instructions/deepeval-testing.md` — DeepEval/Confident AI best practices reference
- `.claude/instructions/langgraph-python.md` — Python conventions for this project

---

## Constraints

- All DeepEval tests are Python. Do not touch the TypeScript test layer.
- DeepEval test functions MUST be synchronous (`def test_*()`), not `async def`. Async LLM calls use `asyncio.run()` inside the test. This is non-negotiable per DeepEval documentation — the DeepEval runner does not support `async def` test functions.
- Every LangGraph feature tested with DeepEval lives in `src/features/{feature_name}/agent/tests/`.
- Never commit `.env.dev`, `.env.qa`, or `.env.prod` — they contain API keys.
- Never commit `CONFIDENT_API_KEY`, `GOOGLE_API_KEY`, or any other secret.
- Do not remove `asyncio_mode = "auto"` from `pyproject.toml` — existing pytest-asyncio tests depend on it. DeepEval tests simply don't use async def, so this setting doesn't interfere.

---

## Phase 1 — Check Current State

Before making any changes, read the existing files to avoid duplicating work:

1. Check `src/features/{feature_name}/agent/requirements-dev.txt` — is `deepeval` already listed?
2. Check `src/features/{feature_name}/agent/pyproject.toml` — does it have `testpaths`?
3. Check `src/features/{feature_name}/agent/tests/conftest.py` — does it exist?
4. Check `.gitignore` (repo root) — are `.env.dev`, `.env.qa`, `.env.prod` already ignored?
5. Check if `.env.dev`, `.env.qa`, `.env.prod` already exist in the agent directory.

Report what exists and what needs to be created before proceeding.

---

## Phase 2 — Install DeepEval

### Step 2a: Update `requirements-dev.txt`

Add `deepeval>=2.0.0` to `src/features/{feature_name}/agent/requirements-dev.txt`.
Preserve all existing entries (pytest, pytest-asyncio, mypy, ruff).

```
-r requirements.txt

pytest==9.0.2
pytest-asyncio==1.3.0
mypy==1.19.1
ruff==0.15.7
deepeval>=2.0.0
```

### Step 2b: Update `pyproject.toml`

Add `testpaths = ["tests"]` to `[tool.pytest.ini_options]` if not already present.
Do NOT add or remove `asyncio_mode` — leave it as-is.

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## Phase 3 — Create Environment Files

Create three `.env.{env}` files inside `src/features/{feature_name}/agent/`.
Use placeholder values — the user fills in the real keys.

**`.env.dev`**
```bash
# DeepEval / Confident AI — dev project
# Get your API key from app.confident-ai.com → bizzie-dev project → Project Settings
CONFIDENT_API_KEY=confident_us_REPLACE_WITH_DEV_KEY

# Gemini API key for the judge model (get free from aistudio.google.com)
GOOGLE_API_KEY=REPLACE_WITH_GEMINI_API_KEY
```

**`.env.qa`**
```bash
# DeepEval / Confident AI — qa project
# Get your API key from app.confident-ai.com → bizzie-qa project → Project Settings
CONFIDENT_API_KEY=confident_us_REPLACE_WITH_QA_KEY

# Gemini API key for the judge model
GOOGLE_API_KEY=REPLACE_WITH_GEMINI_API_KEY
```

**`.env.prod`**
```bash
# DeepEval / Confident AI — prod project
# Get your API key from app.confident-ai.com → bizzie-prod project → Project Settings
CONFIDENT_API_KEY=confident_us_REPLACE_WITH_PROD_KEY

# Gemini API key for the judge model
GOOGLE_API_KEY=REPLACE_WITH_GEMINI_API_KEY
```

**Note:** The Gemini API key is different from Vertex AI. It's a free key from Google AI Studio (aistudio.google.com). This is used only by the DeepEval judge model, not the main agent (which still uses Vertex AI).

---

## Phase 4 — Update `.gitignore`

Add these entries to the repo root `.gitignore` if not already present:

```gitignore
# DeepEval environment files (contain API keys)
src/features/*/agent/.env.dev
src/features/*/agent/.env.qa
src/features/*/agent/.env.prod
```

---

## Phase 5 — Create `tests/conftest.py`

Create `src/features/{feature_name}/agent/tests/conftest.py` with this exact template.
If it already exists and has correct content, do not overwrite it.

```python
"""
Shared pytest fixtures for {feature_name} agent DeepEval tests.

Environment loading order (later overrides earlier):
  1. .env                  → base values
  2. .env.{APP_ENV}        → env-specific values (sets CONFIDENT_API_KEY)
  3. .env.local            → personal local overrides

To switch environments:
  APP_ENV=qa deepeval test run tests/
  APP_ENV=prod deepeval test run tests/

One-time authentication (per machine):
  deepeval login --confident-api-key "your-key-here"
"""

import asyncio
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Path setup — ensures `from src.features.{feature_name}.agent.X import Y` works
# ---------------------------------------------------------------------------
# This file: agent/tests/conftest.py
# Repo root: 5 levels up (tests/ → agent/ → {feature}/ → features/ → src/ → root)
_REPO_ROOT = Path(__file__).parents[5]
sys.path.insert(0, str(_REPO_ROOT))


def pytest_configure(config: pytest.Config) -> None:
    """Load environment variables before any tests run."""
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
    """Compiled LangGraph agent — built once for the entire test session."""
    from src.features.{feature_name}.agent.graph import build_graph
    return build_graph(checkpointer=None)


# ---------------------------------------------------------------------------
# Judge model fixture — uses Gemini API (free key from aistudio.google.com)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def judge_model():
    """
    Gemini judge model for DeepEval metrics.

    Uses the Gemini API (not Vertex AI) to avoid needing GCP credentials
    in the test environment. GOOGLE_API_KEY is set in .env.{APP_ENV}.

    To get a free Gemini API key: aistudio.google.com → Get API Key
    """
    from deepeval.models import GeminiModel

    return GeminiModel(
        model="gemini-2.0-flash",
        api_key=os.getenv("GOOGLE_API_KEY", ""),
    )


# ---------------------------------------------------------------------------
# Hyperparameter logging — attached to Confident AI dashboard
# ---------------------------------------------------------------------------

import deepeval

@deepeval.log_hyperparameters(model="gemini-2.0-flash", prompt_version="v1")
def hyperparameters():
    """Metadata logged alongside each test run on Confident AI."""
    return {
        "judge_model": "gemini-2.0-flash",
        "environment": os.getenv("APP_ENV", "dev"),
    }
```

Replace `{feature_name}` with the actual feature name (e.g., `bizzie_chat`).

---

## Phase 6 — Install and Authenticate

Tell the user to run these commands from the agent directory:

```bash
cd src/features/{feature_name}/agent

# Install DeepEval (run once, or when requirements-dev.txt changes)
pip install -r requirements-dev.txt

# Verify DeepEval is installed
deepeval --version

# Authenticate with Confident AI — dev project (run once per machine)
# Replace with actual key from app.confident-ai.com
deepeval login --confident-api-key "confident_us_YOUR_DEV_KEY_HERE"
```

---

## Phase 7 — Verify

Run a quick sanity check to ensure the environment is set up correctly.
Tell the user to run:

```bash
cd src/features/{feature_name}/agent

# Check env file exists
ls -la .env.dev

# Check deepeval version
deepeval --version

# Confirm CONFIDENT_API_KEY loads correctly (shows project name)
APP_ENV=dev python -c "
import os
from dotenv import load_dotenv
load_dotenv('.env.dev')
key = os.getenv('CONFIDENT_API_KEY', 'NOT SET')
print('CONFIDENT_API_KEY:', key[:20] + '...' if len(key) > 20 else key)
"
```

---

## Phase 8 — Direct to Manual Steps

After completing all automated steps, tell the user:

> Setup complete. The following steps require your browser — see `.claude/info/deepeval-setup-info.md` for a step-by-step walkthrough:
>
> 1. Create 3 projects on Confident AI (bizzie-dev, bizzie-qa, bizzie-prod)
> 2. Copy each project's API key into the corresponding .env.{env} file
> 3. Get a free Gemini API key from Google AI Studio for the judge model
> 4. Fill in .env.dev, .env.qa, .env.prod with the real keys
> 5. Re-run: `deepeval login --confident-api-key "your-dev-key"`

---

## File Output Summary

| File | Action |
|---|---|
| `src/features/{feature_name}/agent/requirements-dev.txt` | Add `deepeval>=2.0.0` |
| `src/features/{feature_name}/agent/pyproject.toml` | Add `testpaths = ["tests"]` |
| `src/features/{feature_name}/agent/.env.dev` | Create with placeholders |
| `src/features/{feature_name}/agent/.env.qa` | Create with placeholders |
| `src/features/{feature_name}/agent/.env.prod` | Create with placeholders |
| `src/features/{feature_name}/agent/tests/conftest.py` | Create |
| `.gitignore` (repo root) | Add env file patterns |
