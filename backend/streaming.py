"""Async streaming pipeline with backpressure handling."""

import asyncio
import enum
import logging
import time
from dataclasses import dataclass, field
from typing import Optional, Callable, Any

logger = logging.getLogger(__name__)


class DegradationLevel(enum.Enum):
    NORMAL = "normal"           # Full pipeline
    SCORE_ONLY = "score_only"   # Skip captions
    PASSTHROUGH = "passthrough" # Use cached embeddings
    SHED_LOAD = "shed_load"     # Drop oldest requests


@dataclass
class PipelineConfig:
    embed_queue_size: int = 10
    score_queue_size: int = 20
    embed_timeout_ms: int = 10000
    score_timeout_ms: int = 2000
    target_latency_ms: int = 10000
    degradation_thresholds: dict = field(default_factory=lambda: {
        DegradationLevel.SCORE_ONLY: 0.80,
        DegradationLevel.PASSTHROUGH: 0.90,
        DegradationLevel.SHED_LOAD: 0.95,
    })


@dataclass
class PipelineMetrics:
    total_processed: int = 0
    total_dropped: int = 0
    avg_latency_ms: float = 0.0
    current_level: DegradationLevel = DegradationLevel.NORMAL
    embed_queue_util: float = 0.0
    score_queue_util: float = 0.0


class StreamingPipeline:
    """Async pipeline for real-time video anomaly detection."""

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.metrics = PipelineMetrics()
        self._embed_queue: asyncio.Queue = asyncio.Queue(maxsize=self.config.embed_queue_size)
        self._score_queue: asyncio.Queue = asyncio.Queue(maxsize=self.config.score_queue_size)
        self._running = False
        self._embed_fn: Optional[Callable] = None
        self._score_fn: Optional[Callable] = None
        self._latencies: list[float] = []

    def set_handlers(self, embed_fn: Callable, score_fn: Callable):
        self._embed_fn = embed_fn
        self._score_fn = score_fn

    @property
    def degradation_level(self) -> DegradationLevel:
        util = max(self.metrics.embed_queue_util, self.metrics.score_queue_util)
        thresholds = self.config.degradation_thresholds
        for level in [DegradationLevel.SHED_LOAD, DegradationLevel.PASSTHROUGH, DegradationLevel.SCORE_ONLY]:
            if util >= thresholds[level]:
                return level
        return DegradationLevel.NORMAL

    async def submit(self, clip_path: str) -> bool:
        """Submit a clip for processing. Returns False if shed."""
        level = self.degradation_level
        self.metrics.current_level = level

        if level == DegradationLevel.SHED_LOAD:
            if self._embed_queue.full():
                self.metrics.total_dropped += 1
                return False

        try:
            self._embed_queue.put_nowait({"path": clip_path, "t_submit": time.perf_counter()})
            return True
        except asyncio.QueueFull:
            self.metrics.total_dropped += 1
            return False

    async def _embed_worker(self):
        while self._running:
            try:
                item = await asyncio.wait_for(self._embed_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            self._update_queue_util()

            if self._embed_fn:
                try:
                    embedding = await asyncio.to_thread(self._embed_fn, item["path"])
                    item["embedding"] = embedding
                    await self._score_queue.put(item)
                except Exception:
                    logger.exception("Embed worker failed for %s", item.get("path"))
                    self.metrics.total_dropped += 1

    async def _score_worker(self):
        while self._running:
            try:
                item = await asyncio.wait_for(self._score_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            self._update_queue_util()

            if self._score_fn and "embedding" in item:
                try:
                    result = await asyncio.to_thread(self._score_fn, item["embedding"])
                    latency = (time.perf_counter() - item["t_submit"]) * 1000
                    self._latencies.append(latency)
                    if len(self._latencies) > 100:
                        self._latencies = self._latencies[-100:]
                    self.metrics.avg_latency_ms = sum(self._latencies) / len(self._latencies)
                    self.metrics.total_processed += 1
                except Exception:
                    logger.exception("Score worker failed")
                    self.metrics.total_dropped += 1

    def _update_queue_util(self):
        self.metrics.embed_queue_util = self._embed_queue.qsize() / max(1, self.config.embed_queue_size)
        self.metrics.score_queue_util = self._score_queue.qsize() / max(1, self.config.score_queue_size)

    async def start(self):
        self._running = True
        self._tasks = [
            asyncio.create_task(self._embed_worker()),
            asyncio.create_task(self._score_worker()),
        ]
        for t in self._tasks:
            t.add_done_callback(self._on_worker_done)

    @staticmethod
    def _on_worker_done(task: asyncio.Task):
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error("Pipeline worker died: %s", exc, exc_info=exc)

    async def stop(self):
        self._running = False
        for t in getattr(self, "_tasks", []):
            t.cancel()
        self._tasks = []
