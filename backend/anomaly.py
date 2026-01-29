"""Anomaly detection via kNN search against normal baseline in Qdrant."""

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

load_dotenv()
logger = logging.getLogger(__name__)

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
COLLECTION_NAME = os.environ.get("COLLECTION_NAME", "anomaly_baseline")

# Default threshold needs recalibration for VideoMAE 768-dim embeddings.
# 0.038 was tuned for Marengo 512-dim on Avenue. VideoMAE will have a
# different distance distribution. Use a higher default and calibrate.
DEFAULT_THRESHOLD = float(os.environ.get("ANOMALY_THRESHOLD", "0.15"))

_qdrant: Optional[QdrantClient] = None
_qdrant_lock = threading.Lock()


def get_qdrant() -> QdrantClient:
    global _qdrant
    if _qdrant is None:
        with _qdrant_lock:
            if _qdrant is None:
                _qdrant = QdrantClient(
                    url=QDRANT_URL,
                    api_key=QDRANT_API_KEY if QDRANT_API_KEY else None,
                )
    return _qdrant


@dataclass
class Neighbor:
    clip_id: str
    similarity: float
    source_video: str
    scene_id: str = ""


@dataclass
class LatencyBreakdown:
    embed_ms: float = 0.0
    search_ms: float = 0.0
    total_ms: float = 0.0


@dataclass
class AnomalyResult:
    anomaly_score: float
    is_anomaly: bool
    neighbors: list[Neighbor]
    latency: LatencyBreakdown = field(default_factory=LatencyBreakdown)

    def to_dict(self):
        return {
            "anomaly_score": self.anomaly_score,
            "is_anomaly": self.is_anomaly,
            "neighbors": [
                {"clip_id": n.clip_id, "similarity": n.similarity, "source_video": n.source_video, "scene_id": n.scene_id}
                for n in self.neighbors
            ],
            "latency_ms": {"embed": self.latency.embed_ms, "search": self.latency.search_ms, "total": self.latency.total_ms},
        }


def score_clip(
    embedding: list[float],
    collection_name: str | None = None,
    k: int = 3,
    threshold: float | None = None,
    scene_id: str | None = None,
) -> AnomalyResult:
    """Score an embedding against the normal baseline using kNN.

    Formula: score = 1 - mean(cosine_sim(embedding, top_k_neighbors))

    If scene_id filter returns no results, falls back to unfiltered search.
    """
    if threshold is None:
        threshold = DEFAULT_THRESHOLD

    client = get_qdrant()
    coll = collection_name or COLLECTION_NAME

    t0 = time.perf_counter()

    # Try filtered search first, fall back to unfiltered
    results = []
    if scene_id:
        query_filter = Filter(must=[FieldCondition(key="scene_id", match=MatchValue(value=scene_id))])
        results = client.query_points(
            collection_name=coll,
            query=embedding,
            limit=k,
            query_filter=query_filter,
        ).points

    # Fallback: unfiltered search if filtered returned nothing
    if not results:
        results = client.query_points(
            collection_name=coll,
            query=embedding,
            limit=k,
        ).points

    search_ms = (time.perf_counter() - t0) * 1000

    if not results:
        logger.warning("No results from Qdrant for collection %s", coll)
        return AnomalyResult(
            anomaly_score=1.0,
            is_anomaly=True,
            neighbors=[],
            latency=LatencyBreakdown(search_ms=search_ms, total_ms=search_ms),
        )

    similarities = [r.score for r in results]
    anomaly_score = 1.0 - (sum(similarities) / len(similarities))

    neighbors = [
        Neighbor(
            clip_id=str(r.id),
            similarity=r.score,
            source_video=r.payload.get("source_video", "") if r.payload else "",
            scene_id=r.payload.get("scene_id", "") if r.payload else "",
        )
        for r in results
    ]

    return AnomalyResult(
        anomaly_score=anomaly_score,
        is_anomaly=anomaly_score > threshold,
        neighbors=neighbors,
        latency=LatencyBreakdown(search_ms=search_ms, total_ms=search_ms),
    )
