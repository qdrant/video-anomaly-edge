"""Video capture loop with async scoring pipeline."""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from edge.config import (
    CAPTURE_SOURCE,
    CLIP_DURATION_S,
    CLIP_OVERLAP_S,
    SCORING_INTERVAL_MS,
)
from edge.detector import EdgeDetector
from edge.model import extract_edge_embedding

logger = logging.getLogger(__name__)


@dataclass
class CaptureStats:
    fps: float = 0.0
    latency_ms: float = 0.0
    clips_scored: int = 0
    escalations: int = 0
    frames_captured: int = 0
    _last_ts: float = field(default_factory=time.monotonic, repr=False)
    _frame_times: deque = field(default_factory=lambda: deque(maxlen=120), repr=False)

    def tick_frame(self) -> None:
        now = time.monotonic()
        self._frame_times.append(now)
        self.frames_captured += 1
        if len(self._frame_times) > 1:
            elapsed = self._frame_times[-1] - self._frame_times[0]
            self.fps = round((len(self._frame_times) - 1) / max(elapsed, 1e-6), 1)

    def as_dict(self) -> dict:
        return {
            "fps": self.fps,
            "latency_ms": round(self.latency_ms, 2),
            "clips_scored": self.clips_scored,
            "escalations": self.escalations,
            "frames_captured": self.frames_captured,
        }


class CaptureLoop:
    """Captures video frames and feeds clips to the anomaly detector."""

    def __init__(self, detector: EdgeDetector, source: Optional[str] = None) -> None:
        self.detector = detector
        self.source = source or CAPTURE_SOURCE
        self.stats = CaptureStats()

        self._cap: Optional[cv2.VideoCapture] = None
        self._running = False
        self._capture_thread: Optional[threading.Thread] = None
        self._frame_buffer: deque[np.ndarray] = deque()
        self._lock = threading.Lock()

        # Async queue for scoring thread to push scores to websocket consumers
        self._score_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=256)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, source: Optional[str] = None) -> None:
        if self._running:
            logger.warning("Capture already running")
            return

        src = source or self.source
        # Try integer camera index
        try:
            src_val: int | str = int(src)
        except ValueError:
            src_val = src

        self._cap = cv2.VideoCapture(src_val)
        if not self._cap.isOpened():
            raise RuntimeError(f"Cannot open video source: {src_val}")

        self._running = True
        self._capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._capture_thread.start()
        logger.info("Capture started from source=%s", src_val)

    def stop(self) -> None:
        self._running = False
        if self._capture_thread:
            self._capture_thread.join(timeout=5)
        if self._cap:
            self._cap.release()
            self._cap = None
        logger.info("Capture stopped")

    @property
    def running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Capture thread
    # ------------------------------------------------------------------

    def _capture_loop(self) -> None:
        assert self._cap is not None
        cam_fps = self._cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames_per_clip = int(cam_fps * CLIP_DURATION_S)
        overlap_frames = int(cam_fps * CLIP_OVERLAP_S)
        interval_s = SCORING_INTERVAL_MS / 1000.0

        clip_frames: list[np.ndarray] = []
        last_score_time = 0.0

        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                # End of file or camera error
                if isinstance(self.source, str) and not self.source.isdigit():
                    logger.info("End of video file")
                    self._running = False
                    break
                continue

            self.stats.tick_frame()
            clip_frames.append(frame)

            # When we have a full clip, score it
            if len(clip_frames) >= frames_per_clip:
                now = time.monotonic()
                if now - last_score_time >= interval_s:
                    self._score_clip(list(clip_frames))
                    last_score_time = now

                # Slide window: keep overlap portion
                clip_frames = clip_frames[-overlap_frames:]

        logger.info("Capture loop exited")

    def _score_clip(self, frames: list[np.ndarray]) -> None:
        t0 = time.monotonic()
        try:
            embedding = extract_edge_embedding(frames)
            score = self.detector.score_local(embedding)
            latency = (time.monotonic() - t0) * 1000
            self.stats.latency_ms = latency
            self.stats.clips_scored += 1

            result = {
                "score": score,
                "escalate": self.detector.should_escalate(score),
                "latency_ms": round(latency, 2),
                "ts": time.time(),
            }

            if result["escalate"]:
                self.stats.escalations += 1
                clip_path = self._save_clip(frames)
                # Schedule async escalation (fire-and-forget from sync thread)
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None
                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        self.detector.escalate_to_cloud(clip_path, embedding, score),
                        loop,
                    )

            # Push to websocket consumers (non-blocking)
            try:
                self._score_queue.put_nowait(result)
            except asyncio.QueueFull:
                pass

        except Exception:
            logger.exception("Scoring failed")

    @staticmethod
    def _save_clip(frames: list[np.ndarray]) -> str:
        """Write frames to a temporary mp4 file, return path."""
        h, w = frames[0].shape[:2]
        path = tempfile.mktemp(suffix=".mp4", prefix="edge_clip_")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(path, fourcc, 30.0, (w, h))
        for f in frames:
            writer.write(f)
        writer.release()
        return path
