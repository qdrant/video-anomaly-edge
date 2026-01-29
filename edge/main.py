"""Edge anomaly detection service — FastAPI on port 7777."""

from __future__ import annotations

import asyncio
import io
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import numpy as np
from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from edge.capture import CaptureLoop
from edge.config import EDGE_PORT
from edge.detector import EdgeDetector
from edge.model import load_edge_model
from edge.sync import EdgeCloudSync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
detector: EdgeDetector
capture: CaptureLoop
sync_service: EdgeCloudSync


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global detector, capture, sync_service

    load_edge_model()
    detector = EdgeDetector()
    capture = CaptureLoop(detector)
    sync_service = EdgeCloudSync(detector)
    sync_service.start()

    logger.info("Edge service ready on port %d", EDGE_PORT)
    yield

    capture.stop()
    sync_service.stop()
    detector.close()
    logger.info("Edge service shut down")


app = FastAPI(title="Edge Anomaly Detector", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": True,
        "qdrant_local": True,
        "baseline_count": detector.baseline_count,
        "capture_running": capture.running,
        "escalation_stats": {
            "total_scored": detector.total_scored,
            "total_escalated": detector.total_escalated,
        },
    }


@app.get("/stats")
async def stats() -> dict:
    return capture.stats.as_dict()


@app.post("/start")
async def start_capture(source: str | None = None) -> dict:
    try:
        capture.start(source)
        return {"status": "started", "source": source or "default"}
    except RuntimeError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})


@app.post("/stop")
async def stop_capture() -> dict:
    capture.stop()
    return {"status": "stopped"}


@app.post("/ingest-baseline")
async def ingest_baseline(file: UploadFile) -> dict:
    """Accept a .npy file containing an (N, D) array of baseline embeddings."""
    content = await file.read()
    arr = np.load(io.BytesIO(content))
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    embeddings = [arr[i] for i in range(arr.shape[0])]
    count = detector.ingest_baseline(embeddings)
    return {"ingested": count, "total_baseline": detector.baseline_count}


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket) -> None:
    """Stream live anomaly scores to dashboard clients."""
    await websocket.accept()
    try:
        while True:
            try:
                result = await asyncio.wait_for(
                    capture._score_queue.get(), timeout=5.0
                )
                await websocket.send_json(result)
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"heartbeat": True})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception:
        logger.exception("WebSocket error")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    import uvicorn

    uvicorn.run(
        "edge.main:app",
        host="0.0.0.0",
        port=EDGE_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
