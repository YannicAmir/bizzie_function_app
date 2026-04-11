# Python LangGraph — Setup & Deployment

Project structure, dependency management, code quality, and Cloud Run deployment for LangGraph services.

---

## Project Structure

Each LangGraph-enabled feature lives under `src/features/[feature_name]/langgraph/`:

```
src/features/[feature_name]/langgraph/
├── state.py              # TypedDict state definition
├── nodes.py              # Node functions (pure, typed, async)
├── graph.py              # StateGraph wiring, compile()
├── config.py             # Model IDs, limits, flags (from env)
├── tools.py              # Tool definitions (only if using tools)
├── requirements.txt      # Pinned production dependencies
└── requirements-dev.txt  # Dev/test dependencies
```

If promoted to a standalone Cloud Run container:

```
langgraph_[feature_name]/
├── src/agent/
│   ├── __init__.py
│   ├── state.py
│   ├── nodes.py
│   ├── graph.py
│   ├── config.py
│   └── tools.py
├── main.py               # FastAPI entry point
├── Dockerfile
├── pyproject.toml
└── tests/
    └── test_*.py
```

---

## Dependency Management

**`requirements.txt` — exact versions in production:**
```
langgraph==0.2.x
langchain-core==0.3.x
langchain-google-vertexai==2.x.x
langgraph-checkpoint-postgres==0.x.x
fastapi==0.115.x
uvicorn[standard]==0.34.x
google-cloud-logging==3.x.x
pydantic==2.x.x
python-dotenv==1.x.x
```

**`requirements-dev.txt`:**
```
-r requirements.txt
pytest>=7.0
pytest-asyncio>=0.23
mypy>=1.8
ruff>=0.3
```

**`pyproject.toml` (tool config only — no duplicate deps):**
```toml
[project]
name = "langgraph-[feature_name]"
requires-python = ">=3.11"

[tool.ruff]
target-version = "py311"
line-length = 100
select = ["E", "F", "W", "I", "UP", "B"]

[tool.mypy]
python_version = "3.11"
strict = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

**Local setup:**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
```

---

## Code Quality Commands

```bash
ruff check src/       # lint
ruff format src/      # format
mypy src/             # type check
pytest tests/ -v      # run tests
```

Run all before committing:
```bash
ruff check src/ && ruff format src/ && mypy src/ && pytest tests/
```

---

## Deployment (Cloud Run)

**Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
COPY main.py .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**`main.py`:**
```python
import google.cloud.logging
from fastapi import FastAPI
from pydantic import BaseModel
from src.agent.graph import graph

google.cloud.logging.Client().setup_logging()
app = FastAPI()

class InvokeRequest(BaseModel):
    input: dict
    thread_id: str

@app.post("/invoke")
async def invoke(req: InvokeRequest):
    result = await graph.ainvoke(
        req.input,
        config={"configurable": {"thread_id": req.thread_id}},
    )
    return {"output": result, "run_id": req.thread_id}
```

The calling Cloud Function's `timeoutSeconds` must exceed the Cloud Run container's maximum expected execution time + 15s buffer.