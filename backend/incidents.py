"""Incident formation from per-clip anomaly scores.

Implements: temporal smoothing, hysteresis thresholding, duration filtering, cooldown merge.
"""

from dataclasses import dataclass, field
from typing import Optional
import statistics
import uuid


@dataclass
class Window:
    window_id: str
    feed_id: str
    clip_index: int
    feed_t_start_ms: int
    feed_t_end_ms: int
    raw_score: float
    smoothed_score: float = 0.0
    is_anomaly_gt: bool = False
    neighbors: list = field(default_factory=list)
    scene_id: Optional[str] = None


@dataclass
class Incident:
    incident_id: str
    feed_id: str
    feed_t_start_ms: int
    feed_t_end_ms: int
    duration_ms: int
    severity: int
    peak_score: float
    mean_score: float
    window_count: int
    windows: list[str]
    status: str = "new"
    is_true_positive: Optional[bool] = None
    time_to_detect_ms: Optional[int] = None


@dataclass
class IncidentBuilderConfig:
    smoothing_method: str = "ema"
    ema_alpha: float = 0.3
    median_window: int = 3
    t_high: float = 0.045
    t_low: float = 0.025
    min_duration_ms: int = 10000
    min_windows: int = 1
    cooldown_ms: int = 20000
    severity_min_score: float = 0.03
    severity_max_score: float = 0.10


class IncidentBuilder:
    def __init__(self, config: Optional[IncidentBuilderConfig] = None):
        self.config = config or IncidentBuilderConfig()

    def build(self, windows: list[Window]) -> list[Incident]:
        if not windows:
            return []

        # Group by feed_id to avoid merging incidents across different feeds
        from itertools import groupby
        windows = sorted(windows, key=lambda w: (w.feed_id, w.feed_t_start_ms))
        all_incidents = []
        for feed_id, feed_windows in groupby(windows, key=lambda w: w.feed_id):
            feed_windows = list(feed_windows)
            self._apply_smoothing(feed_windows)
            raw_incidents = self._detect_with_hysteresis(feed_windows)
            filtered = [inc for inc in raw_incidents if inc.duration_ms >= self.config.min_duration_ms and inc.window_count >= self.config.min_windows]
            merged = self._merge_cooldown(filtered)
            all_incidents.extend(merged)
        return all_incidents

    def _apply_smoothing(self, windows: list[Window]):
        cfg = self.config
        if cfg.smoothing_method == "ema":
            prev = windows[0].raw_score
            for w in windows:
                smoothed = cfg.ema_alpha * w.raw_score + (1 - cfg.ema_alpha) * prev
                w.smoothed_score = smoothed
                prev = smoothed
        elif cfg.smoothing_method == "median":
            half = cfg.median_window // 2
            for i, w in enumerate(windows):
                start = max(0, i - half)
                end = min(len(windows), i + half + 1)
                w.smoothed_score = statistics.median(win.raw_score for win in windows[start:end])
        else:
            for w in windows:
                w.smoothed_score = w.raw_score

    def _detect_with_hysteresis(self, windows: list[Window]) -> list[Incident]:
        incidents = []
        in_incident = False
        current_windows: list[Window] = []

        for w in windows:
            score = w.smoothed_score
            if not in_incident:
                if score >= self.config.t_high:
                    in_incident = True
                    current_windows = [w]
            else:
                if score < self.config.t_low:
                    incidents.append(self._build_incident(current_windows))
                    in_incident = False
                    current_windows = []
                else:
                    current_windows.append(w)

        if in_incident and current_windows:
            incidents.append(self._build_incident(current_windows))

        return incidents

    def _build_incident(self, windows: list[Window]) -> Incident:
        scores = [w.smoothed_score for w in windows]
        peak = max(scores)
        mean = sum(scores) / len(scores)
        severity = self._score_to_severity(peak)

        return Incident(
            incident_id=str(uuid.uuid4())[:8],
            feed_id=windows[0].feed_id,
            feed_t_start_ms=windows[0].feed_t_start_ms,
            feed_t_end_ms=windows[-1].feed_t_end_ms,
            duration_ms=windows[-1].feed_t_end_ms - windows[0].feed_t_start_ms,
            severity=severity,
            peak_score=peak,
            mean_score=mean,
            window_count=len(windows),
            windows=[w.window_id for w in windows],
        )

    def _score_to_severity(self, score: float) -> int:
        cfg = self.config
        normalized = (score - cfg.severity_min_score) / (cfg.severity_max_score - cfg.severity_min_score)
        return max(0, min(100, int(normalized * 100)))

    def _merge_cooldown(self, incidents: list[Incident]) -> list[Incident]:
        if len(incidents) <= 1:
            return incidents

        merged = [incidents[0]]
        for inc in incidents[1:]:
            prev = merged[-1]
            gap = inc.feed_t_start_ms - prev.feed_t_end_ms
            if gap <= self.config.cooldown_ms:
                prev.feed_t_end_ms = inc.feed_t_end_ms
                prev.duration_ms = prev.feed_t_end_ms - prev.feed_t_start_ms
                prev.peak_score = max(prev.peak_score, inc.peak_score)
                prev.mean_score = (prev.mean_score * prev.window_count + inc.mean_score * inc.window_count) / (prev.window_count + inc.window_count)
                prev.window_count += inc.window_count
                prev.windows.extend(inc.windows)
                prev.severity = self._score_to_severity(prev.peak_score)
            else:
                merged.append(inc)
        return merged
