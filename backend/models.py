"""Pydantic models for the API."""

from pydantic import BaseModel
from typing import Optional


class Segment(BaseModel):
    segment_id: str
    src_url: str
    feed_start_ms: int
    duration_ms: int
    thumb_url: str


class WindowModel(BaseModel):
    window_id: str
    feed_t_start_ms: int
    feed_t_end_ms: int
    severity: int
    is_anomaly: bool
    neighbors_normal: list[dict]


class FeedSummary(BaseModel):
    feed_id: str
    label: str
    duration_ms: int
    segment_count: int
    incident_count: int
    top_severity: int


class FeedManifest(BaseModel):
    feed_id: str
    dataset_id: str
    label: str
    duration_ms: int
    segment_count: int
    segments: list[Segment]
    windows: list[WindowModel]


class NeighborResponse(BaseModel):
    clip_id: str
    similarity: float
    source_video: str
    scene_id: str = ""


class AnomalyResultResponse(BaseModel):
    anomaly_score: float
    is_anomaly: bool
    neighbors: list[NeighborResponse]
    latency_ms: dict
    scoring_method: str = "visual"


class IncidentResponse(BaseModel):
    incident_id: str
    feed_id: str
    feed_t_start_ms: int
    feed_t_end_ms: int
    duration_ms: int
    severity: int
    peak_score: float
    mean_score: float
    window_count: int
    status: str = "new"


class EmbedRequest(BaseModel):
    """Request to score a pre-computed embedding."""
    embedding: list[float]
    collection_name: Optional[str] = None
    k: int = 3


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    qdrant_connected: bool


# --- Edge escalation models ---

class EscalationRequestModel(BaseModel):
    """Escalation request from an edge device."""
    edge_device_id: str
    edge_score: float
    edge_embedding: list[float]
    timestamp_ms: int = 0
    scene_id: str = ""
    metadata: dict = {}


class EscalationResponseModel(BaseModel):
    """Cloud response to an edge escalation."""
    escalation_id: str
    cloud_score: float
    is_confirmed_anomaly: bool
    confidence: float
    incident_id: Optional[str] = None
    ensemble_score: Optional[float] = None
    latency_ms: float = 0.0


class EdgeDeviceModel(BaseModel):
    """Edge device registration and status."""
    device_id: str
    name: str
    location: str
    status: str = "online"
    baseline_version: str = ""
    threshold: float = 0.038
    stats: Optional[dict] = None


class EdgeRegisterRequest(BaseModel):
    """Request to register a new edge device."""
    name: str
    location: str
    device_id: Optional[str] = None


class EnsembleResultModel(BaseModel):
    """Result of multi-model ensemble scoring."""
    edge_score: float
    cloud_score: float
    ensemble_score: float
    confidence: float
    is_anomaly: bool
    temporal_boost: float = 0.0
