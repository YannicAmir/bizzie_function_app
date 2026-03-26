---
name: DeepEval Setup Steps
description: Workflow for initializing DeepEval and Confident AI infrastructure.
---

# DeepEval Setup Steps

Follow these phases to initialize the evaluation environment.

---

## Phase 1: Dependency Management

1.  **Add Dependencies**: Update `requirements-dev.txt` in the feature's agent directory with `deepeval>=2.0.0` and `pytest-asyncio`.
2.  **Verify Version**: Ensure the latest version of `deepeval` is installed in the local environment.

---

## Phase 2: Configuration

1.  **Pytest Config**: Update `pyproject.toml` to include:
    - `testpaths = ["tests"]`
    - `asyncio_mode = "auto"`
2.  **Environment Templates**: Create template `.env.dev`, `.env.qa`, and `.env.prod` files in the agent directory with placeholders for `CONFIDENT_API_KEY`.
3.  **GitIgnore**: Add the environment files to the root `.gitignore`.

---

## Phase 3: Infrastructure Scaffold

1.  **Scaffold conftest.py**: Create a session-scoped fixture in `tests/conftest.py` for:
    - Path resolution so feature imports work.
    - Environment loading based on `APP_ENV`.
    - Graph compilation (if LangGraph).
    - Judge model initialization (Gemini 2.0 Flash via `GeminiVertexAI`).
2.  **Login Verification**: Assist the user in running the `deepeval login` command safely.

---

## Verification Checklist

- [ ] `deepeval` is in the feature's `requirements-dev.txt`.
- [ ] `pyproject.toml` has `testpaths` and `asyncio_mode` configured.
- [ ] Environment files created with placeholders for `CONFIDENT_API_KEY`.
- [ ] `.gitignore` updated to exclude environment files.
- [ ] `conftest.py` includes paths, env loading, and the Gemini judge fixture.
- [ ] Authentication verified via `deepeval login`.
- [ ] All paths follow project-root-relative standards.
