"""
FastAPI entry point for the bizzie_chat LangGraph Cloud Run service.

Endpoints:
  POST /invoke  — run the bizzie_chat graph; returns final state fields
  GET  /health  — liveness probe; used by Cloud Run health checks

Integration contract (with usecase.ts caller):
  Request:  { "input": { <BizzieState input fields> }, "thread_id": "<string>" }
  Response: { "output": { "message": str, "followUps": [...], "metadata": {...} }, "run_id": str }
"""

import logging
import os
from contextlib import asynccontextmanager

import google.cloud.logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Load .env then .env.local (override) — for local development only; no-op if files absent
load_dotenv()
load_dotenv(".env.local", override=True)

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.graph import build_graph, make_checkpointer

# ── Cloud Logging setup ───────────────────────────────────────────────────────
if config.env != "local":
    google.cloud.logging.Client(project=config.gcp_project).setup_logging()

logger = logging.getLogger(__name__)

# ── LangSmith tracing ─────────────────────────────────────────────────────────
if config.langsmith_api_key:
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", config.langsmith_api_key)
    os.environ.setdefault("LANGCHAIN_PROJECT", config.langsmith_project)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    checkpointer = make_checkpointer()
    if hasattr(checkpointer, "asetup"):
        await checkpointer.asetup()  # type: ignore[union-attr]
    app.state.graph = build_graph(checkpointer)
    logger.info("Graph initialized", extra={"json_fields": {"checkpointer": type(checkpointer).__name__}})
    yield

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="bizzie-chat",
    description="LangGraph AI chat service for Bizzie stock app.",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Request / response models ─────────────────────────────────────────────────

class InvokeRequest(BaseModel):
    """
    HTTP request body for POST /invoke.

    `input` maps directly to BizzieState input fields (set at graph entry).
    `thread_id` is used as the LangGraph checkpointer thread key.
    """
    input: dict = Field(..., description="BizzieState input fields")
    thread_id: str = Field(..., description="Checkpointer thread ID (uid+ticker scoped)")


class ChatOutput(BaseModel):
    message: str | None = None
    follow_ups: list[str] = Field(default_factory=list)
    source: str | None = None
    route_path: str | None = None
    retry_after_seconds: int | None = None
    metadata: dict = Field(default_factory=dict)


class InvokeResponse(BaseModel):
    output: ChatOutput
    run_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/invoke", response_model=InvokeResponse)
async def invoke(request: Request, req: InvokeRequest) -> InvokeResponse:
    """
    Invoke the bizzie_chat graph with the given input state.

    The thread_id binds this invocation to its Redis checkpoint key so that
    retries resume from the last completed node rather than restarting.

    Raises:
        422 — validation error (Pydantic, automatic)
        500 — unhandled graph exception
    """
    run_config = {
        "configurable": {"thread_id": req.thread_id},
        "recursion_limit": 25,
    }

    try:
        result: dict = await request.app.state.graph.ainvoke(req.input, config=run_config)
    except Exception as exc:
        logger.error(
            "Graph invocation failed",
            extra={
                "json_fields": {
                    "thread_id": req.thread_id,
                    "error": str(exc),
                }
            },
        )
        raise HTTPException(status_code=500, detail="Graph execution failed") from exc

    output = ChatOutput(
        message=result.get("final_response"),
        follow_ups=result.get("follow_ups", []),
        source=result.get("source"),
        route_path=result.get("route_path"),
        retry_after_seconds=result.get("retry_after_seconds"),
        metadata=result.get("metadata", {}),
    )

    logger.info(
        "Graph invocation completed",
        extra={
            "json_fields": {
                "thread_id": req.thread_id,
                "route_path": output.route_path,
                "source": output.source,
            }
        },
    )

    return InvokeResponse(output=output, run_id=req.thread_id)


@app.get("/health")
async def health() -> JSONResponse:
    """Liveness probe. Returns 200 when the service is up."""
    return JSONResponse(content={"status": "ok"})


# ── Exception handler ─────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception",
        extra={"json_fields": {"path": request.url.path, "error": str(exc)}},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
