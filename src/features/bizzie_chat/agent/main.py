import json
import logging
import os
from contextlib import asynccontextmanager

import google.cloud.logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()
load_dotenv(".env.local", override=True)

from src.features.bizzie_chat.agent.config import config  # noqa: E402
from src.features.bizzie_chat.agent.graph import build_graph, make_checkpointer  # noqa: E402

if config.env != "local":
    google.cloud.logging.Client(project=config.gcp_project).setup_logging()

logger = logging.getLogger(__name__)

if config.langsmith_api_key:
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", config.langsmith_api_key)
    os.environ.setdefault("LANGCHAIN_PROJECT", config.langsmith_project)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.redis_ca_cert:
        with open("/tmp/redis-ca.pem", "w") as f:
            f.write(config.redis_ca_cert)
        logger.info("Redis CA cert written to /tmp/redis-ca.pem")
    checkpointer = make_checkpointer()
    if hasattr(checkpointer, "asetup"):
        try:
            await checkpointer.asetup()  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning(
                "Checkpointer asetup failed, falling back to MemorySaver",
                extra={"json_fields": {"error": str(exc)}},
            )
            from langgraph.checkpoint.memory import MemorySaver
            checkpointer = MemorySaver()
    app.state.graph = build_graph(checkpointer)
    logger.info("Graph initialized", extra={"json_fields": {"checkpointer": type(checkpointer).__name__}})
    yield

app = FastAPI(
    title="bizzie-chat",
    description="LangGraph AI chat service for Bizzie stock app.",
    version="1.0.0",
    lifespan=lifespan,
)

class InvokeRequest(BaseModel):
    """BizzieState input fields and thread_id for checkpointer."""
    input: dict = Field(..., description="BizzieState input fields")
    thread_id: str = Field(..., description="Checkpointer thread ID (uid+ticker scoped)")

    @property
    def query(self) -> str:
        return self.input.get("query", "")

    def model_post_init(self, __context: object) -> None:
        if len(self.query) > 1500:
            raise ValueError("query exceeds maximum length of 1500 characters")


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


@app.post("/invoke", response_model=InvokeResponse)
async def invoke(request: Request, req: InvokeRequest) -> InvokeResponse:
    """Invoke the bizzie_chat graph with the given input state."""
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

@app.post("/stream")
async def stream(request: Request, req: InvokeRequest) -> StreamingResponse:
    """Stream the final_response tokens via SSE, then emit a done event with follow_ups/source/metadata."""
    run_config = {
        "configurable": {"thread_id": req.thread_id},
        "recursion_limit": 25,
    }

    async def event_generator():
        result: dict = {}
        try:
            async for event in request.app.state.graph.astream_events(
                req.input,
                config=run_config,
                version="v2",
            ):
                kind = event.get("event", "")
                tags = event.get("tags", [])
                if kind == "on_chat_model_stream" and "final_response" in tags:
                    chunk = event.get("data", {}).get("chunk")
                    if chunk is None:
                        continue
                    content = chunk.content if hasattr(chunk, "content") else ""
                    if isinstance(content, list):
                        content = "".join(
                            b.get("text", "") if isinstance(b, dict) else str(b)
                            for b in content
                            if not isinstance(b, dict) or b.get("type") == "text"
                        )
                    if content:
                        yield f"data: {json.dumps({'type': 'token', 'token': content})}\n\n"
                elif kind == "on_chain_end" and event.get("name") == "LangGraph":
                    result = event.get("data", {}).get("output", {})
        except Exception as exc:
            logger.error("Streaming error", extra={"json_fields": {"error": str(exc)}})
            yield f"data: {json.dumps({'type': 'error', 'message': 'Stream interrupted'})}\n\n"
            return

        done_payload = {
            "type": "done",
            "follow_ups": result.get("follow_ups", []),
            "source": result.get("source"),
            "route_path": result.get("route_path"),
            "metadata": result.get("metadata", {}),
        }
        yield f"data: {json.dumps(done_payload)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health")
async def health() -> JSONResponse:
    """Liveness probe."""
    return JSONResponse(content={"status": "ok"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception",
        extra={"json_fields": {"path": request.url.path, "error": str(exc)}},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
