"""Normal memory governance - prevents baseline drift and poisoning."""

import os
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

QUARANTINE_DURATION_S = float(os.environ.get("QUARANTINE_DURATION_S", "3600"))
CONTAMINATION_THRESHOLD = float(os.environ.get("CONTAMINATION_THRESHOLD", "0.025"))
RETENTION_WINDOW_S = float(os.environ.get("RETENTION_WINDOW_S", str(7 * 86400)))  # 7 days
PER_SCENE_CAP = int(os.environ.get("PER_SCENE_CAP", "500"))
SCRUB_INTERVAL_S = float(os.environ.get("SCRUB_INTERVAL_S", "3600"))


@dataclass
class QuarantinedClip:
    clip_id: str
    embedding: list[float]
    anomaly_score: float
    scene_id: str
    source_video: str
    quarantined_at: float = field(default_factory=time.time)
    admitted: bool = False
    rejected: bool = False


@dataclass
class BaselineEntry:
    clip_id: str
    embedding: list[float]
    scene_id: str
    source_video: str
    added_at: float = field(default_factory=time.time)
    anomaly_score_at_add: float = 0.0


class MemoryGovernor:
    """Governs what gets added to the normal baseline to prevent poisoning."""

    def __init__(self):
        self._quarantine: dict[str, QuarantinedClip] = {}
        self._baseline: dict[str, BaselineEntry] = {}
        self._scene_counts: dict[str, int] = defaultdict(int)
        self._last_scrub: float = time.time()

    def quarantine(
        self,
        embedding: list[float],
        anomaly_score: float,
        scene_id: str = "",
        source_video: str = "",
    ) -> Optional[str]:
        """Quarantine a new normal candidate. Returns clip_id if accepted for quarantine."""
        # Reject if score too high - likely contaminated
        if anomaly_score > CONTAMINATION_THRESHOLD:
            return None

        clip_id = f"q-{uuid.uuid4().hex[:8]}"
        self._quarantine[clip_id] = QuarantinedClip(
            clip_id=clip_id,
            embedding=embedding,
            anomaly_score=anomaly_score,
            scene_id=scene_id,
            source_video=source_video,
        )
        return clip_id

    def process_quarantine(self, score_fn) -> list[str]:
        """Admit clips that have aged past quarantine and still score as normal.

        Args:
            score_fn: callable(embedding) -> anomaly_score
        Returns:
            List of admitted clip_ids
        """
        now = time.time()
        admitted = []

        for clip_id, clip in list(self._quarantine.items()):
            if clip.admitted or clip.rejected:
                continue

            age = now - clip.quarantined_at
            if age < QUARANTINE_DURATION_S:
                continue

            # Re-score to check it's still normal
            current_score = score_fn(clip.embedding)
            if current_score > CONTAMINATION_THRESHOLD:
                clip.rejected = True
                continue

            # Check per-scene cap
            if self._scene_counts[clip.scene_id] >= PER_SCENE_CAP:
                clip.rejected = True
                continue

            # Admit
            clip.admitted = True
            self._baseline[clip_id] = BaselineEntry(
                clip_id=clip_id,
                embedding=clip.embedding,
                scene_id=clip.scene_id,
                source_video=clip.source_video,
                anomaly_score_at_add=current_score,
            )
            self._scene_counts[clip.scene_id] += 1
            admitted.append(clip_id)

        # Clean up processed quarantine entries
        self._quarantine = {
            k: v for k, v in self._quarantine.items()
            if not v.admitted and not v.rejected
        }

        return admitted

    def scrub(self, score_fn) -> list[str]:
        """Remove contaminated normals from baseline.

        Args:
            score_fn: callable(embedding) -> anomaly_score
        Returns:
            List of removed clip_ids
        """
        now = time.time()
        removed = []

        for clip_id, entry in list(self._baseline.items()):
            # Retention window: remove old entries
            if now - entry.added_at > RETENTION_WINDOW_S:
                del self._baseline[clip_id]
                self._scene_counts[entry.scene_id] = max(0, self._scene_counts[entry.scene_id] - 1)
                removed.append(clip_id)
                continue

            # Re-score to detect contamination
            current_score = score_fn(entry.embedding)
            if current_score > CONTAMINATION_THRESHOLD * 1.5:  # stricter for removal
                del self._baseline[clip_id]
                self._scene_counts[entry.scene_id] = max(0, self._scene_counts[entry.scene_id] - 1)
                removed.append(clip_id)

        self._last_scrub = now
        return removed

    def needs_scrub(self) -> bool:
        return (time.time() - self._last_scrub) > SCRUB_INTERVAL_S

    def stats(self) -> dict:
        return {
            "quarantine_count": len(self._quarantine),
            "baseline_count": len(self._baseline),
            "scene_counts": dict(self._scene_counts),
            "last_scrub": self._last_scrub,
            "needs_scrub": self.needs_scrub(),
        }

    def get_baseline_embeddings(self) -> list[dict]:
        """Return all baseline entries for syncing to edge devices."""
        return [
            {
                "clip_id": e.clip_id,
                "embedding": e.embedding,
                "scene_id": e.scene_id,
                "source_video": e.source_video,
            }
            for e in self._baseline.values()
        ]


# Global governor
memory_governor = MemoryGovernor()
