import asyncio
import logging
import time
from typing import Any

from google.cloud import firestore

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.state import BizzieState

logger = logging.getLogger(__name__)

_firestore_client: firestore.AsyncClient | None = None


def _get_thread_id(state: BizzieState) -> str:
    return state["session_id"]


def _to_unix(ts: Any) -> float:
    return ts.timestamp() if hasattr(ts, "timestamp") else float(ts)


async def _get_firestore_client() -> firestore.AsyncClient:
    global _firestore_client
    if _firestore_client is None:
        _firestore_client = await asyncio.to_thread(firestore.AsyncClient, project=config.gcp_project)
    return _firestore_client


async def _read_circuit_breaker() -> dict[str, Any]:
    db = await _get_firestore_client()
    doc = await db.collection(config.circuit_breaker_collection).document(config.circuit_breaker_doc).get()
    if not doc.exists:
        return {"state": "closed", "failure_count": 0}
    return doc.to_dict() or {"state": "closed", "failure_count": 0}


async def _write_circuit_breaker(data: dict[str, Any]) -> None:
    db = await _get_firestore_client()
    await db.collection(config.circuit_breaker_collection).document(config.circuit_breaker_doc).set(
        data, merge=True
    )


def _is_circuit_open(cb_data: dict[str, Any]) -> bool:
    state = cb_data.get("state", "closed")
    if state == "closed":
        return False
    if state == "open":
        next_retry = cb_data.get("next_retry_time")
        if next_retry and time.time() >= _to_unix(next_retry):
            return False
        return True
    return False


async def _record_fmp_success() -> None:
    await _write_circuit_breaker({"state": "closed", "failure_count": 0})


async def _record_fmp_failure(cb_data: dict[str, Any]) -> None:
    failure_count = cb_data.get("failure_count", 0) + 1
    now = time.time()
    raw_window_start = cb_data.get("window_start_time")
    window_start = _to_unix(raw_window_start) if raw_window_start is not None else None

    if window_start is None or (now - window_start) > config.circuit_breaker_window_seconds:
        failure_count = 1
        window_start = now

    new_state = "closed"
    next_retry_time = None
    if failure_count >= config.circuit_breaker_failure_threshold:
        new_state = "open"
        next_retry_time = now + config.circuit_breaker_cooldown_seconds

    update: dict[str, Any] = {
        "state": new_state,
        "failure_count": failure_count,
        "last_failure_time": firestore.SERVER_TIMESTAMP,
        "window_start_time": window_start,
    }
    if next_retry_time:
        update["next_retry_time"] = next_retry_time

    await _write_circuit_breaker(update)


async def ambassador_circuit_breaker_check(state: BizzieState) -> dict[str, Any]:
    node_name = "ambassador_circuit_breaker_check"
    thread_id = _get_thread_id(state)
    try:
        cb_data = await _read_circuit_breaker()
        fmp_available = not _is_circuit_open(cb_data)
        logger.info(
            f"{node_name}: complete",
            extra={"json_fields": {"node": node_name, "thread_id": thread_id, "fmp_available": fmp_available, "cb_state": cb_data.get("state")}},
        )
        return {"fmp_available": fmp_available}
    except Exception as exc:
        logger.error(
            f"{node_name}: error reading circuit breaker",
            extra={"json_fields": {"node": node_name, "thread_id": thread_id, "error": str(exc)}},
        )
        return {"fmp_available": True}


async def stock_query_circuit_breaker_check(state: BizzieState) -> dict[str, Any]:
    node_name = "stock_query_circuit_breaker_check"
    thread_id = _get_thread_id(state)
    try:
        cb_data = await _read_circuit_breaker()
        fmp_available = not _is_circuit_open(cb_data)
        logger.info(
            f"{node_name}: complete",
            extra={"json_fields": {"node": node_name, "thread_id": thread_id, "fmp_available": fmp_available, "cb_state": cb_data.get("state")}},
        )
        return {"fmp_available": fmp_available}
    except Exception as exc:
        logger.error(
            f"{node_name}: error reading circuit breaker",
            extra={"json_fields": {"node": node_name, "thread_id": thread_id, "error": str(exc)}},
        )
        return {"fmp_available": True}
