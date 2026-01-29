"""Edge-cloud synchronisation: pull baselines, push metrics, flush offline queue."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx
import numpy as np

from edge.config import CLOUD_API_KEY, CLOUD_API_URL, SYNC_INTERVAL_S
from edge.detector import EdgeDetector

logger = logging.getLogger(__name__)


class EdgeCloudSync:
    """Periodically syncs baseline vectors from cloud and pushes metrics."""

    def __init__(self, detector: EdgeDetector) -> None:
        self.detector = detector
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.ensure_future(self._loop())
        logger.info("Sync loop started (interval=%ds)", SYNC_INTERVAL_S)

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._pull_baseline()
                await self._push_metrics()
                await self.detector.flush_offline_queue()
            except Exception:
                logger.exception("Sync cycle failed")
            await asyncio.sleep(SYNC_INTERVAL_S)

    # ------------------------------------------------------------------
    # Pull baseline from cloud
    # ------------------------------------------------------------------

    async def _pull_baseline(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = self._auth_headers()
                resp = await client.get(
                    f"{CLOUD_API_URL}/baseline/export", headers=headers
                )
                resp.raise_for_status()
                data = resp.json()

            embeddings = [
                np.array(v["vector"], dtype=np.float32) for v in data.get("vectors", [])
            ]
            metadata = [v.get("payload", {}) for v in data.get("vectors", [])]

            if embeddings:
                count = self.detector.ingest_baseline(embeddings, metadata)
                logger.info("Pulled %d baseline vectors from cloud", count)
        except httpx.HTTPError as exc:
            logger.debug("Baseline pull skipped (cloud unavailable): %s", exc)

    # ------------------------------------------------------------------
    # Push metrics to cloud
    # ------------------------------------------------------------------

    async def _push_metrics(self) -> None:
        metrics = {
            "baseline_count": self.detector.baseline_count,
            "total_scored": self.detector.total_scored,
            "total_escalated": self.detector.total_escalated,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = self._auth_headers()
                resp = await client.post(
                    f"{CLOUD_API_URL}/edge/metrics",
                    headers=headers,
                    json=metrics,
                )
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.debug("Metrics push skipped (cloud unavailable): %s", exc)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _auth_headers() -> dict[str, str]:
        if CLOUD_API_KEY:
            return {"Authorization": f"Bearer {CLOUD_API_KEY}"}
        return {}
