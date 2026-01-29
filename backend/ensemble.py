"""Multi-model ensemble scoring combining edge and cloud embeddings."""

import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

DEFAULT_CLOUD_WEIGHT = float(os.environ.get("ENSEMBLE_CLOUD_WEIGHT", "0.7"))
DEFAULT_EDGE_WEIGHT = float(os.environ.get("ENSEMBLE_EDGE_WEIGHT", "0.3"))
TEMPORAL_BOOST_WINDOW = int(os.environ.get("TEMPORAL_BOOST_WINDOW", "5"))
TEMPORAL_BOOST_FACTOR = float(os.environ.get("TEMPORAL_BOOST_FACTOR", "0.1"))


@dataclass
class EnsembleResult:
    edge_score: float
    cloud_score: float
    ensemble_score: float
    confidence: float
    is_anomaly: bool
    temporal_boost: float = 0.0
    weights_used: dict = field(default_factory=dict)


class EnsembleScorer:
    """Combine edge and cloud scores with temporal context and adaptive thresholds."""

    def __init__(
        self,
        cloud_weight: float = DEFAULT_CLOUD_WEIGHT,
        edge_weight: float = DEFAULT_EDGE_WEIGHT,
    ):
        self.cloud_weight = cloud_weight
        self.edge_weight = edge_weight
        # Per-device recent escalation timestamps for temporal boosting
        self._recent_escalations: dict[str, list[float]] = defaultdict(list)
        # Per-device adaptive thresholds
        self._device_thresholds: dict[str, float] = {}
        self._default_threshold = float(os.environ.get("ENSEMBLE_THRESHOLD", "0.038"))

    def score(
        self,
        edge_score: float,
        cloud_score: float,
        device_id: Optional[str] = None,
        timestamp: Optional[float] = None,
    ) -> EnsembleResult:
        """Compute ensemble score from edge and cloud scores."""
        # Weighted fusion
        raw_ensemble = self.cloud_weight * cloud_score + self.edge_weight * edge_score

        # Temporal boost: consecutive escalations from same device
        boost = 0.0
        if device_id and timestamp:
            boost = self._compute_temporal_boost(device_id, timestamp)

        ensemble_score = min(1.0, raw_ensemble + boost)

        # Confidence from agreement
        agreement = 1.0 - abs(edge_score - cloud_score)
        confidence = max(0.0, min(1.0, agreement))

        # Threshold (adaptive per device or default)
        threshold = self._device_thresholds.get(device_id, self._default_threshold) if device_id else self._default_threshold

        return EnsembleResult(
            edge_score=edge_score,
            cloud_score=cloud_score,
            ensemble_score=ensemble_score,
            confidence=confidence,
            is_anomaly=ensemble_score > threshold,
            temporal_boost=boost,
            weights_used={"cloud": self.cloud_weight, "edge": self.edge_weight},
        )

    def _compute_temporal_boost(self, device_id: str, timestamp: float) -> float:
        """Boost score if N consecutive escalations from same device in recent window."""
        history = self._recent_escalations[device_id]
        history.append(timestamp)

        # Keep only recent entries within window
        cutoff = timestamp - TEMPORAL_BOOST_WINDOW * 60  # window in minutes
        self._recent_escalations[device_id] = [t for t in history if t > cutoff]

        count = len(self._recent_escalations[device_id])
        if count <= 1:
            return 0.0
        return min(0.3, (count - 1) * TEMPORAL_BOOST_FACTOR)

    def set_device_threshold(self, device_id: str, threshold: float):
        self._device_thresholds[device_id] = threshold

    def get_device_threshold(self, device_id: str) -> float:
        return self._device_thresholds.get(device_id, self._default_threshold)


# Global scorer
ensemble_scorer = EnsembleScorer()
