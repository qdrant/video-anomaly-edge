"""Cloud escalation handler for edge device escalations."""

import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

from .anomaly import score_clip, get_qdrant
from .incidents import IncidentBuilder, IncidentBuilderConfig, Window, Incident
from . import twelvelabs_client, vss

load_dotenv()
logger = logging.getLogger(__name__)

MODEL_SERVER_URL = os.environ.get("MODEL_SERVER_URL", "http://localhost:9877")
CLOUD_COLLECTION = os.environ.get("COLLECTION_NAME", "anomaly_baseline")
ESCALATION_THRESHOLD = float(os.environ.get("ESCALATION_THRESHOLD", "0.038"))
CONFIRMATION_K = int(os.environ.get("CONFIRMATION_K", "5"))


@dataclass
class EscalationRequest:
    edge_device_id: str
    edge_score: float
    edge_embedding: list[float]
    clip_data: Optional[bytes] = None
    clip_filename: str = ""
    timestamp_ms: int = 0
    scene_id: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class EscalationResult:
    escalation_id: str
    edge_device_id: str
    edge_score: float
    cloud_score: float
    is_confirmed_anomaly: bool
    confidence: float
    incident_id: Optional[str] = None
    cloud_embedding: Optional[list[float]] = None
    latency_ms: float = 0.0


class EscalationTracker:
    """Tracks escalation statistics across all edge devices."""

    def __init__(self):
        self.escalations: list[EscalationResult] = []
        self._per_device: dict[str, list[EscalationResult]] = {}

    @property
    def escalation_count(self) -> int:
        return len(self.escalations)

    @property
    def confirmation_rate(self) -> float:
        if not self.escalations:
            return 0.0
        confirmed = sum(1 for e in self.escalations if e.is_confirmed_anomaly)
        return confirmed / len(self.escalations)

    @property
    def avg_cloud_score(self) -> float:
        if not self.escalations:
            return 0.0
        return sum(e.cloud_score for e in self.escalations) / len(self.escalations)

    @property
    def edge_accuracy(self) -> float:
        """How often the edge device's anomaly call matches cloud's verdict."""
        if not self.escalations:
            return 0.0
        # Edge escalated because it thought anomaly; cloud confirms = edge was right
        return self.confirmation_rate

    def record(self, result: EscalationResult):
        self.escalations.append(result)
        self._per_device.setdefault(result.edge_device_id, []).append(result)

    def device_stats(self, device_id: str) -> dict:
        results = self._per_device.get(device_id, [])
        if not results:
            return {"escalation_count": 0, "confirmation_rate": 0.0, "avg_cloud_score": 0.0}
        confirmed = sum(1 for r in results if r.is_confirmed_anomaly)
        return {
            "escalation_count": len(results),
            "confirmation_rate": confirmed / len(results),
            "avg_cloud_score": sum(r.cloud_score for r in results) / len(results),
            "false_positive_count": len(results) - confirmed,
        }

    def summary(self) -> dict:
        return {
            "escalation_count": self.escalation_count,
            "confirmation_rate": self.confirmation_rate,
            "avg_cloud_score": self.avg_cloud_score,
            "edge_accuracy": self.edge_accuracy,
        }


# Global tracker
tracker = EscalationTracker()
incident_builder = IncidentBuilder(IncidentBuilderConfig())


async def handle_escalation(request: EscalationRequest) -> EscalationResult:
    """Process an escalated clip from an edge device.

    1. Re-embed with full VideoMAE model (if clip data provided)
    2. Score against cloud Qdrant collection
    3. Compare edge vs cloud score
    4. Confirm or reject anomaly
    """
    t0 = time.perf_counter()
    escalation_id = str(uuid.uuid4())[:12]

    cloud_embedding = None
    # If raw clip provided, re-embed with full cloud model
    if request.clip_data:
        # Try Twelve Labs path first if enabled
        if twelvelabs_client.is_enabled():
            try:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                    tmp.write(request.clip_data)
                    tmp_path = tmp.name

                # Upload to Twelve Labs for indexing
                upload_result = twelvelabs_client.upload_video(tmp_path, index_type="marengo")
                video_id = upload_result.get("marengo_video_id")

                if video_id:
                    # Also ingest via VSS if enabled
                    if vss.is_enabled():
                        await vss.ingest_video(tmp_path)

                    # Get cloud embedding from Twelve Labs
                    embedding = twelvelabs_client.get_video_embedding(video_id)
                    if embedding:
                        cloud_embedding = embedding
                        logger.info("Re-embedded via Twelve Labs: video_id=%s, dim=%d", video_id, len(embedding))

                Path(tmp_path).unlink(missing_ok=True)
            except Exception as exc:
                logger.warning("Twelve Labs re-embedding failed, falling back to model server: %s", exc)

        # Fall back to local model server
        if cloud_embedding is None:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{MODEL_SERVER_URL}/embed",
                        files={"file": (request.clip_filename or "clip.mp4", request.clip_data, "video/mp4")},
                    )
                    resp.raise_for_status()
                    embed_data = resp.json()
                    cloud_embedding = embed_data["embedding"]
            except Exception:
                cloud_embedding = None

    # Score with cloud embedding if available, else use edge embedding
    scoring_embedding = cloud_embedding if cloud_embedding else request.edge_embedding

    cloud_result = score_clip(
        embedding=scoring_embedding,
        collection_name=CLOUD_COLLECTION,
        k=CONFIRMATION_K,
        scene_id=request.scene_id or None,
    )

    cloud_score = cloud_result.anomaly_score
    is_confirmed = cloud_score > ESCALATION_THRESHOLD

    # Confidence: agreement between edge and cloud = higher confidence
    score_diff = abs(request.edge_score - cloud_score)
    confidence = max(0.0, min(1.0, 1.0 - score_diff))

    incident_id = None
    if is_confirmed:
        incident_id = f"esc-{escalation_id}"

    latency_ms = (time.perf_counter() - t0) * 1000

    result = EscalationResult(
        escalation_id=escalation_id,
        edge_device_id=request.edge_device_id,
        edge_score=request.edge_score,
        cloud_score=cloud_score,
        is_confirmed_anomaly=is_confirmed,
        confidence=confidence,
        incident_id=incident_id,
        cloud_embedding=cloud_embedding,
        latency_ms=latency_ms,
    )

    tracker.record(result)
    return result
