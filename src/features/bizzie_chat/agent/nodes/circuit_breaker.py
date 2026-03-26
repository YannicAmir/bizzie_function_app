"""
Circuit breaker infrastructure for FMP availability.

Reads/writes a Firestore document at /circuitBreaker/fmp to track failures
and control whether FMP calls are attempted on each request.
"""

import asyncio
import logging
import time
from typing import Any

from google.cloud import firestore

from src.features.bizzie_chat.agent.config import config
from src.features.bizzie_chat.agent.state import BizzieState

logger = logging.getLogger(__name__)

_firestore_client: firestore.AsyncClient | None = None


async def _get_firestore_client() -> firestore.AsyncClient:
    """Get or initialize the singleton Firestore AsyncClient asynchronously."""
    global _firestore_client
    if _firestore_client is None:
        _firestore_client = await asyncio.to_thread(firestore.AsyncClient, project=config.gcp_project)
    return _firestore_client


async def _read_circuit_breaker() -> dict[str, Any]:
    """Read /circuitBreaker/fmp from Firestore. Returns state dict."""
    db = await _get_firestore_client()
    doc = await db.collection(config.circuit_breaker_collection).document(config.circuit_breaker_doc).get()
    if not doc.exists:
        return {"state": "closed", "failure_count": 0}
    return doc.to_dict() or {"state": "closed", "failure_count": 0}


async def _write_circuit_breaker(data: dict[str, Any]) -> None:
    """Write circuit breaker state to /circuitBreaker/fmp."""
    db = await _get_firestore_client()
    await db.collection(config.circuit_breaker_collection).document(config.circuit_breaker_doc).set(
        data, merge=True
    )


def _is_circuit_open(cb_data: dict[str, Any]) -> bool:
    """Return True if the circuit breaker is open (FMP unavailable)."""
    state = cb_data.get("state", "closed")
    if state == "closed":
        return False
    if state == "open":
        next_retry = cb_data.get("next_retry_time")
        if next_retry:
            now = time.time()
            if hasattr(next_retry, "timestamp"):
                next_retry = next_retry.timestamp()
            if now >= next_retry:
                return False
        return True
    return False


async def _record_fmp_success(cb_data: dict[str, Any]) -> None:
    """Record a successful FMP call — close the circuit breaker."""
    await _write_circuit_breaker({"state": "closed", "failure_count": 0})


async def _record_fmp_failure(cb_data: dict[str, Any]) -> None:
    """Record a failed FMP call — increment failure count, open if threshold reached."""
    failure_count = cb_data.get("failure_count", 0) + 1
    now = time.time()
    window_start = cb_data.get("window_start_time")
    if window_start is not None and hasattr(window_start, "timestamp"):
        window_start = window_start.timestamp()

    if window_start is None or (now - (window_start or 0)) > config.circuit_breaker_window_seconds:
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


def _get_thread_id(state: BizzieState) -> str:
    return f"{state['session_id']}"


async def ambassador_circuit_breaker_check(state: BizzieState) -> dict[str, Any]:
    """
    Read /circuitBreaker/fmp and set fmp_available for the ambassador path.
    """
    thread_id = _get_thread_id(state)
    try:
        cb_data = await _read_circuit_breaker()
        fmp_available = not _is_circuit_open(cb_data)
        logger.info(
            "ambassador_circuit_breaker_check: complete",
            extra={
                "json_fields": {
                    "node": "ambassador_circuit_breaker_check",
                    "thread_id": thread_id,
                    "fmp_available": fmp_available,
                    "cb_state": cb_data.get("state"),
                }
            },
        )
        return {"fmp_available": fmp_available}
    except Exception as exc:
        logger.error(
            "ambassador_circuit_breaker_check: error reading circuit breaker",
            extra={"json_fields": {"node": "ambassador_circuit_breaker_check", "thread_id": thread_id, "error": str(exc)}},
        )
        return {"fmp_available": True}


async def stock_query_circuit_breaker_check(state: BizzieState) -> dict[str, Any]:
    """Read /circuitBreaker/fmp and set fmp_available for the stock query path."""
    thread_id = _get_thread_id(state)
    try:
        cb_data = await _read_circuit_breaker()
        fmp_available = not _is_circuit_open(cb_data)
        logger.info(
            "stock_query_circuit_breaker_check: complete",
            extra={
                "json_fields": {
                    "node": "stock_query_circuit_breaker_check",
                    "thread_id": thread_id,
                    "fmp_available": fmp_available,
                    "cb_state": cb_data.get("state"),
                }
            },
        )
        return {"fmp_available": fmp_available}
    except Exception as exc:
        logger.error(
            "stock_query_circuit_breaker_check: error",
            extra={"json_fields": {"node": "stock_query_circuit_breaker_check", "thread_id": thread_id, "error": str(exc)}},
        )
        return {"fmp_available": True}
