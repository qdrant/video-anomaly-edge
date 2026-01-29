"""FastAPI backend for video anomaly detection."""

import json
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .anomaly import score_clip, get_qdrant
from . import twelvelabs_client, vss
from .models import (
    AnomalyResultResponse,
    EdgeDeviceModel,
    EdgeRegisterRequest,
    EmbedRequest,
    EnsembleResultModel,
    EscalationRequestModel,
    EscalationResponseModel,
    HealthResponse,
    IncidentResponse,
    NeighborResponse,
)
from .escalation import EscalationRequest, handle_escalation, tracker as escalation_tracker
from .ensemble import ensemble_scorer
from .edge_registry import registry as edge_registry
from .memory import memory_governor

load_dotenv()

logger = logging.getLogger(__name__)
MODEL_SERVER_URL = os.environ.get("MODEL_SERVER_URL", "http://localhost:9877")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_qdrant()
    except Exception as e:
        logger.warning("Qdrant not available at startup: %s", e)
    yield


app = FastAPI(
    title="Video Anomaly Detection API",
    description="kNN-based video anomaly detection with VideoMAE V2 embeddings",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    qdrant_ok = False
    try:
        client = get_qdrant()
        client.get_collections()
        qdrant_ok = True
    except Exception:
        pass

    model_ok = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{MODEL_SERVER_URL}/health")
            model_ok = resp.status_code == 200
    except Exception:
        pass

    return HealthResponse(
        status="ok" if qdrant_ok else "degraded",
        model_loaded=model_ok,
        qdrant_connected=qdrant_ok,
    )


@app.post("/api/embed")
async def embed_video(file: UploadFile = File(...)):
    """Upload a video clip and get its embedding from the model server."""
    content = await file.read()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{MODEL_SERVER_URL}/embed",
                files={"file": (file.filename, content, file.content_type or "video/mp4")},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Model server error: {e}")


@app.post("/api/score", response_model=AnomalyResultResponse)
async def score_embedding(req: EmbedRequest):
    """Score a pre-computed embedding against the normal baseline."""
    t0 = time.perf_counter()
    result = score_clip(
        embedding=req.embedding,
        collection_name=req.collection_name,
        k=req.k,
    )
    total_ms = (time.perf_counter() - t0) * 1000

    return AnomalyResultResponse(
        anomaly_score=result.anomaly_score,
        is_anomaly=result.is_anomaly,
        neighbors=[
            NeighborResponse(
                clip_id=n.clip_id,
                similarity=n.similarity,
                source_video=n.source_video,
                scene_id=n.scene_id,
            )
            for n in result.neighbors
        ],
        latency_ms={"embed": 0, "search": result.latency.search_ms, "total": total_ms},
    )


@app.post("/api/detect")
async def detect_anomaly(file: UploadFile = File(...)):
    """End-to-end: upload video -> embed -> score -> return result."""
    content = await file.read()

    # Get embedding from model server
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{MODEL_SERVER_URL}/embed",
                files={"file": (file.filename, content, file.content_type or "video/mp4")},
            )
            resp.raise_for_status()
            embed_data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Model server error: {e}")

    # Score against baseline
    embedding = embed_data["embedding"]
    result = score_clip(embedding=embedding)

    return {
        "anomaly_score": result.anomaly_score,
        "is_anomaly": result.is_anomaly,
        "embedding_dim": len(embedding),
        "latency_ms": {
            "embed": embed_data.get("latency_ms", 0),
            "search": result.latency.search_ms,
        },
        "neighbors": [
            {"clip_id": n.clip_id, "similarity": n.similarity}
            for n in result.neighbors
        ],
    }


@app.get("/api/incidents", response_model=list[IncidentResponse])
async def list_incidents():
    """List detected incidents. In production, this would query a database."""
    return []


@app.get("/api/feeds")
async def list_feeds():
    """List available video feeds. In production, this would query S3/database."""
    return {"feeds": [], "count": 0}


@app.get("/api/qdrant/stats")
async def qdrant_stats():
    """Get Qdrant collection statistics."""
    try:
        client = get_qdrant()
        collection_name = os.environ.get("COLLECTION_NAME", "anomaly_baseline")
        info = client.get_collection(collection_name)
        return {
            "collection": collection_name,
            "points_count": info.points_count,
            "vectors_count": info.vectors_count,
            "status": info.status.value,
        }
    except Exception as e:
        raise HTTPException(500, f"Qdrant error: {e}")


# --- Edge escalation endpoints ---


@app.post("/api/escalate", response_model=EscalationResponseModel)
async def escalate_clip(
    file: Optional[UploadFile] = File(None),
    edge_device_id: str = Form(...),
    edge_score: float = Form(...),
    edge_embedding: str = Form(...),  # JSON-encoded list of floats
    timestamp_ms: int = Form(0),
    scene_id: str = Form(""),
):
    """Receive an escalated clip from an edge device for cloud re-analysis."""
    try:
        embedding = json.loads(edge_embedding)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(400, "edge_embedding must be a JSON-encoded list of floats")

    clip_data = None
    clip_filename = ""
    if file:
        clip_data = await file.read()
        clip_filename = file.filename or "clip.mp4"

    request = EscalationRequest(
        edge_device_id=edge_device_id,
        edge_score=edge_score,
        edge_embedding=embedding,
        clip_data=clip_data,
        clip_filename=clip_filename,
        timestamp_ms=timestamp_ms,
        scene_id=scene_id,
    )

    result = await handle_escalation(request)

    # Update edge device stats
    device = edge_registry.get(edge_device_id)
    if device:
        device.record_escalation(result.is_confirmed_anomaly)

    # Compute ensemble score
    ens = ensemble_scorer.score(
        edge_score=edge_score,
        cloud_score=result.cloud_score,
        device_id=edge_device_id,
        timestamp=time.time(),
    )

    return EscalationResponseModel(
        escalation_id=result.escalation_id,
        cloud_score=result.cloud_score,
        is_confirmed_anomaly=result.is_confirmed_anomaly,
        confidence=result.confidence,
        incident_id=result.incident_id,
        ensemble_score=ens.ensemble_score,
        latency_ms=result.latency_ms,
    )


@app.get("/api/escalations/stats")
async def escalation_stats():
    """Get escalation tracker summary."""
    return escalation_tracker.summary()


# --- Edge device management endpoints ---


@app.get("/api/edges", response_model=list[EdgeDeviceModel])
async def list_edges():
    """List all registered edge devices with stats."""
    devices = edge_registry.list_all()
    return [
        EdgeDeviceModel(
            device_id=d.device_id,
            name=d.name,
            location=d.location,
            status=d.status,
            baseline_version=d.baseline_version,
            threshold=d.threshold,
            stats=d.stats(),
        )
        for d in devices
    ]


@app.post("/api/edges/register", response_model=EdgeDeviceModel)
async def register_edge(req: EdgeRegisterRequest):
    """Register a new edge device."""
    device = edge_registry.register(
        name=req.name,
        location=req.location,
        device_id=req.device_id,
    )
    return EdgeDeviceModel(
        device_id=device.device_id,
        name=device.name,
        location=device.location,
        status=device.status,
        baseline_version=device.baseline_version,
        threshold=device.threshold,
        stats=device.stats(),
    )


@app.post("/api/edges/{device_id}/sync-baseline")
async def sync_baseline(device_id: str):
    """Trigger baseline sync to an edge device."""
    device = edge_registry.get(device_id)
    if not device:
        raise HTTPException(404, f"Device {device_id} not found")

    # Mark as syncing and generate new version
    version = f"v-{int(time.time())}"
    edge_registry.set_baseline_version(device_id, version)

    baseline_data = memory_governor.get_baseline_embeddings()

    return {
        "device_id": device_id,
        "baseline_version": version,
        "status": "syncing",
        "baseline_entries": len(baseline_data),
    }


@app.get("/api/edges/{device_id}/stats")
async def edge_device_stats(device_id: str):
    """Get per-device analytics."""
    device = edge_registry.get(device_id)
    if not device:
        raise HTTPException(404, f"Device {device_id} not found")

    device_stats = device.stats()
    escalation_device_stats = escalation_tracker.device_stats(device_id)

    return {
        **device_stats,
        "escalation_details": escalation_device_stats,
        "ensemble_threshold": ensemble_scorer.get_device_threshold(device_id),
    }


@app.get("/api/memory/stats")
async def memory_stats():
    """Get memory governor statistics."""
    return memory_governor.stats()


# --- Twelve Labs + VSS endpoints ---


@app.post("/api/vss/upload")
async def vss_upload(file: UploadFile = File(...)):
    """Upload a video to NVIDIA VSS for indexing via Twelve Labs."""
    content = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await vss.ingest_video(tmp_path)
        return result
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/api/twelvelabs/upload")
async def twelvelabs_upload(
    file: UploadFile = File(...),
    index_type: str = Form("both"),
):
    """Upload a video to Twelve Labs for Marengo/Pegasus indexing."""
    if not twelvelabs_client.is_enabled():
        raise HTTPException(503, "TWELVE_LABS_API_KEY not configured")

    content = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = twelvelabs_client.upload_video(tmp_path, index_type=index_type)
        return result
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@app.post("/api/search")
async def search_videos(query: str = Form(...), max_clips: int = Form(10)):
    """Semantic video search via Twelve Labs Marengo."""
    if not twelvelabs_client.is_enabled():
        raise HTTPException(503, "TWELVE_LABS_API_KEY not configured")

    results = twelvelabs_client.search_videos(query, max_clips=max_clips)
    return {
        "query": query,
        "results": [
            {
                "video_id": r.video_id,
                "score": r.score,
                "start": r.start,
                "end": r.end,
                "confidence": r.confidence,
                "metadata": r.metadata,
            }
            for r in results
        ],
    }


@app.post("/api/analyze")
async def analyze_video_endpoint(video_id: str = Form(...), prompt: str = Form(...)):
    """Video Q&A via Twelve Labs Pegasus."""
    if not twelvelabs_client.is_enabled():
        raise HTTPException(503, "TWELVE_LABS_API_KEY not configured")

    result = twelvelabs_client.analyze_video(video_id, prompt)
    return {
        "video_id": result.video_id,
        "text": result.text,
        "latency_ms": result.latency_ms,
    }


@app.get("/api/vss/health")
async def vss_health():
    """Check NVIDIA VSS health."""
    return await vss.health()


@app.get("/api/twelvelabs/status")
async def twelvelabs_status():
    """Check Twelve Labs configuration status."""
    return {
        "enabled": twelvelabs_client.is_enabled(),
        "marengo_model": twelvelabs_client.MARENGO_MODEL,
        "pegasus_model": twelvelabs_client.PEGASUS_MODEL,
    }
