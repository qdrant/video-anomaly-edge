"""Twelve Labs API client for video embedding, search, and analysis.

Wraps the twelvelabs Python SDK following the pattern from
nvidia-vss/src/vss-engine/src/models/twelve_labs/twelve_labs_model.py
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from twelvelabs import TwelveLabs

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TWELVE_LABS_API_KEY = os.getenv("TWELVE_LABS_API_KEY", "")
TWELVE_LABS_API_URL = os.getenv("TWELVE_LABS_API_URL", "https://api.twelvelabs.io/v1.3")
MARENGO_INDEX_NAME = os.getenv("TWELVE_LABS_MARENGO_INDEX_NAME", "anomaly-marengo-search")
PEGASUS_INDEX_NAME = os.getenv("TWELVE_LABS_PEGASUS_INDEX_NAME", "anomaly-pegasus-summary")
MARENGO_MODEL = os.getenv("TWELVE_LABS_MARENGO_MODEL", "marengo2.7")
PEGASUS_MODEL = os.getenv("TWELVE_LABS_PEGASUS_MODEL", "pegasus1.2")
UPLOAD_TIMEOUT = int(os.getenv("TWELVE_LABS_UPLOAD_TIMEOUT", "600"))
MAX_CLIPS = int(os.getenv("TWELVE_LABS_MAX_CLIPS", "10"))


def is_enabled() -> bool:
    return bool(TWELVE_LABS_API_KEY)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class SearchResult:
    video_id: str
    score: float
    start: float
    end: float
    confidence: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class AnalysisResult:
    text: str
    video_id: str
    latency_ms: float = 0.0


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

_client: Optional[TwelveLabs] = None
_marengo_index_id: Optional[str] = None
_pegasus_index_id: Optional[str] = None


def get_client() -> TwelveLabs:
    global _client
    if _client is None:
        if not TWELVE_LABS_API_KEY:
            raise RuntimeError("TWELVE_LABS_API_KEY not set")
        _client = TwelveLabs(api_key=TWELVE_LABS_API_KEY)
    return _client


def _ensure_index(index_name: str, models: list[dict]) -> str:
    """Get or create a Twelve Labs index, return its ID."""
    client = get_client()
    # Check existing indexes
    indexes = client.index.list()
    for idx in indexes:
        if idx.name == index_name:
            return idx.id
    # Create new index
    idx = client.index.create(
        name=index_name,
        models=models,
    )
    logger.info("Created Twelve Labs index %s (id=%s)", index_name, idx.id)
    return idx.id


def get_marengo_index_id() -> str:
    global _marengo_index_id
    if _marengo_index_id is None:
        _marengo_index_id = _ensure_index(
            MARENGO_INDEX_NAME,
            [{"name": MARENGO_MODEL, "options": ["visual", "audio"]}],
        )
    return _marengo_index_id


def get_pegasus_index_id() -> str:
    global _pegasus_index_id
    if _pegasus_index_id is None:
        _pegasus_index_id = _ensure_index(
            PEGASUS_INDEX_NAME,
            [{"name": PEGASUS_MODEL, "options": ["visual", "audio"]}],
        )
    return _pegasus_index_id


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


def upload_video(file_path: str | Path, index_type: str = "both") -> dict:
    """Upload a video to Twelve Labs for indexing.

    Args:
        file_path: Path to the video file.
        index_type: "marengo", "pegasus", or "both".

    Returns:
        Dict with video IDs: {"marengo_video_id": ..., "pegasus_video_id": ...}
    """
    client = get_client()
    result = {}

    if index_type in ("marengo", "both"):
        idx_id = get_marengo_index_id()
        task = client.task.create(
            index_id=idx_id,
            file=str(file_path),
        )
        task.wait_for_done(timeout=UPLOAD_TIMEOUT)
        if task.status == "ready":
            result["marengo_video_id"] = task.video_id
            logger.info("Uploaded to Marengo: video_id=%s", task.video_id)
        else:
            logger.error("Marengo upload failed: %s", task.status)

    if index_type in ("pegasus", "both"):
        idx_id = get_pegasus_index_id()
        task = client.task.create(
            index_id=idx_id,
            file=str(file_path),
        )
        task.wait_for_done(timeout=UPLOAD_TIMEOUT)
        if task.status == "ready":
            result["pegasus_video_id"] = task.video_id
            logger.info("Uploaded to Pegasus: video_id=%s", task.video_id)
        else:
            logger.error("Pegasus upload failed: %s", task.status)

    return result


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def search_videos(
    query: str,
    max_clips: int | None = None,
    threshold: str = "medium",
    group_by: str = "clip",
) -> list[SearchResult]:
    """Semantic search across all indexed videos using Marengo.

    Pattern from: nvidia-vss twelve_labs_model.py _marengo_search_all()
    """
    client = get_client()
    idx_id = get_marengo_index_id()

    search_results = client.search.query(
        index_id=idx_id,
        search_options=["visual", "audio"],
        query_text=query,
        group_by=group_by,
        threshold=threshold,
        page_limit=max_clips or MAX_CLIPS,
        sort_option="score",
    )

    results = []
    for group in search_results.data:
        for clip in group.clips:
            results.append(SearchResult(
                video_id=clip.video_id,
                score=clip.score,
                start=clip.start,
                end=clip.end,
                confidence=clip.confidence,
                metadata={"module_type": clip.module_type} if hasattr(clip, "module_type") else {},
            ))
    return results


# ---------------------------------------------------------------------------
# Analyze (Pegasus Q&A)
# ---------------------------------------------------------------------------


def analyze_video(video_id: str, prompt: str) -> AnalysisResult:
    """Ask a question about a specific video using Pegasus.

    Pattern from: twelvelabs-nvidia-vss-sample frontend/src/app/api/analysis/route.js
    """
    client = get_client()
    t0 = time.perf_counter()

    response = client.generate.text(
        video_id=video_id,
        prompt=prompt,
        temperature=0.2,
    )

    latency_ms = (time.perf_counter() - t0) * 1000

    return AnalysisResult(
        text=response.data if hasattr(response, "data") else str(response),
        video_id=video_id,
        latency_ms=latency_ms,
    )


# ---------------------------------------------------------------------------
# Embed (get embedding for a video via Marengo)
# ---------------------------------------------------------------------------


def get_video_embedding(video_id: str) -> Optional[list[float]]:
    """Get the embedding vector for a video from Twelve Labs.

    This uses the Marengo embedding endpoint to retrieve the video's
    embedding for use in Qdrant kNN scoring.
    """
    client = get_client()
    try:
        response = client.embed.create(
            model_name=MARENGO_MODEL,
            video_id=video_id,
        )
        if response.video_embedding and response.video_embedding.values:
            return response.video_embedding.values
    except Exception as exc:
        logger.warning("Failed to get embedding for video %s: %s", video_id, exc)
    return None
