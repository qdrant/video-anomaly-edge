"""Edge-tier configuration. All secrets loaded from .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
EDGE_MODEL_NAME: str = os.getenv("EDGE_MODEL_NAME", "efficientnet_b0")
EDGE_EMBEDDING_DIM: int = int(os.getenv("EDGE_EMBEDDING_DIM", "1280"))
FRAMES_PER_CLIP: int = int(os.getenv("FRAMES_PER_CLIP", "8"))

# ---------------------------------------------------------------------------
# Qdrant local / embedded
# ---------------------------------------------------------------------------
QDRANT_EDGE_PATH: str = os.getenv(
    "QDRANT_EDGE_PATH",
    str(Path(__file__).resolve().parent / "qdrant_edge_storage"),
)
COLLECTION_NAME: str = os.getenv("QDRANT_COLLECTION", "edge_baseline")

# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
ESCALATION_THRESHOLD: float = float(os.getenv("ESCALATION_THRESHOLD", "0.06"))
K_NEIGHBORS: int = int(os.getenv("K_NEIGHBORS", "5"))
SCORING_INTERVAL_MS: int = int(os.getenv("SCORING_INTERVAL_MS", "200"))

# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------
CLIP_DURATION_S: float = float(os.getenv("CLIP_DURATION_S", "5.0"))
CLIP_OVERLAP_S: float = float(os.getenv("CLIP_OVERLAP_S", "2.5"))
CAPTURE_SOURCE: str = os.getenv("CAPTURE_SOURCE", "0")  # camera index or file path

# ---------------------------------------------------------------------------
# Cloud / escalation
# ---------------------------------------------------------------------------
CLOUD_API_URL: str = os.getenv("CLOUD_API_URL", "http://localhost:9876/api")
CLOUD_API_KEY: str = os.getenv("CLOUD_API_KEY", "")

# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
SYNC_INTERVAL_S: int = int(os.getenv("SYNC_INTERVAL_S", "300"))  # 5 min

# ---------------------------------------------------------------------------
# Mutable shard retention
# ---------------------------------------------------------------------------
# Strategy: "none" | "time_window" | "score_priority"
#   none           — only evict after successful sync (Option A)
#   time_window    — evict points older than RETENTION_SECONDS (Option B)
#   score_priority — keep top RETENTION_MAX_POINTS by score, pin unsynced anomalies (Option C)
RETENTION_STRATEGY: str = os.getenv("RETENTION_STRATEGY", "none")
RETENTION_SECONDS: int = int(os.getenv("RETENTION_SECONDS", "1800"))  # 30 min
RETENTION_MAX_POINTS: int = int(os.getenv("RETENTION_MAX_POINTS", "2000"))
RETENTION_CHECK_INTERVAL_S: int = int(os.getenv("RETENTION_CHECK_INTERVAL_S", "300"))  # 5 min
OFFLINE_QUEUE_DIR: str = os.getenv(
    "OFFLINE_QUEUE_DIR",
    str(Path(__file__).resolve().parent / "offline_queue"),
)

# ---------------------------------------------------------------------------
# VSS / Twelve Labs
# ---------------------------------------------------------------------------
VSS_ENABLED: bool = os.getenv("VSS_ENABLED", "false").lower() == "true"

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
EDGE_PORT: int = int(os.getenv("EDGE_PORT", "7777"))
