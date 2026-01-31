"""Edge anomaly detector backed by Qdrant Edge (native Rust shards).

Uses the two-shard architecture from qdrant-edge-py:
  - mutable shard:   receives live clip embeddings, unindexed for fast writes
  - immutable shard: HNSW-indexed baseline synced from cloud server

Both shards are queried together and results are merged.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
from persistqueue import SQLiteAckQueue
from qdrant_edge import (
    Distance as EdgeDistance,
    EdgeConfig,
    EdgeShard,
    Point,
    Query,
    QueryRequest,
    SearchRequest,
    UpdateOperation,
    VectorDataConfig,
    FieldCondition,
    Filter,
    RangeFloat,
)

from edge.config import (
    CLOUD_API_KEY,
    CLOUD_API_URL,
    COLLECTION_NAME,
    EDGE_EMBEDDING_DIM,
    ESCALATION_THRESHOLD,
    K_NEIGHBORS,
    OFFLINE_QUEUE_DIR,
    QDRANT_EDGE_PATH,
    RETENTION_CHECK_INTERVAL_S,
    RETENTION_MAX_POINTS,
    RETENTION_SECONDS,
    RETENTION_STRATEGY,
)

logger = logging.getLogger(__name__)

SHARD_CONFIG = EdgeConfig(
    vector_data=VectorDataConfig(
        size=EDGE_EMBEDDING_DIM,
        distance=EdgeDistance.Cosine,
    )
)

SYNC_INTERVAL = 5  # seconds
SYNC_TIMESTAMP_KEY = "sync_timestamp"


class EdgeDetector:
    """On-device kNN anomaly scorer using Qdrant Edge shards."""

    def __init__(self) -> None:
        self._data_dir = Path(QDRANT_EDGE_PATH)
        self._mutable_dir = self._data_dir / "mutable"
        self._immutable_dir = self._data_dir / "immutable"
        self._queue_dir = self._data_dir / "upload_queue"

        self._mutable_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Initialising Qdrant Edge shards at %s", self._data_dir)
        self._mutable_shard = EdgeShard(str(self._mutable_dir), SHARD_CONFIG)
        self._immutable_shard: Optional[EdgeShard] = None
        if self._immutable_dir.exists():
            self._immutable_shard = EdgeShard(str(self._immutable_dir), None)

        # Persistent upload queue (SQLite-backed, survives crashes)
        self._upload_queue = SQLiteAckQueue(
            path=str(self._queue_dir), auto_commit=True, multithreading=True
        )

        # Offline escalation queue (JSON files)
        self._offline_dir = Path(OFFLINE_QUEUE_DIR)
        self._offline_dir.mkdir(parents=True, exist_ok=True)

        # Stats
        self.total_scored: int = 0
        self.total_escalated: int = 0

        # Start background sync worker
        self._sync_running = False
        self._sync_thread: Optional[threading.Thread] = None
        self._start_sync_worker()

        # Start background retention worker
        self._retention_running = False
        self._retention_thread: Optional[threading.Thread] = None
        self._start_retention_worker()

    # ------------------------------------------------------------------
    # Sync worker (edge → cloud upload queue)
    # ------------------------------------------------------------------

    def _start_sync_worker(self) -> None:
        self._sync_running = True
        self._sync_thread = threading.Thread(target=self._sync_worker, daemon=True)
        self._sync_thread.start()

    def _sync_worker(self) -> None:
        while self._sync_running:
            items = []
            while self._upload_queue.size > 0:
                try:
                    items.append(self._upload_queue.get(block=False))
                except Exception:
                    break

            if items:
                self._upload_batch(items)

            time.sleep(SYNC_INTERVAL)

    def _upload_batch(self, items: list) -> bool:
        try:
            import requests
            headers = {}
            if CLOUD_API_KEY:
                headers["Authorization"] = f"Bearer {CLOUD_API_KEY}"
            resp = requests.post(
                f"{CLOUD_API_URL}/api/upsert",
                json=items,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            for item in items:
                self._upload_queue.ack(item)
            return True
        except Exception:
            for item in items:
                self._upload_queue.nack(item)
            return False

    def stop_sync(self) -> None:
        self._sync_running = False
        if self._sync_thread:
            self._sync_thread.join(timeout=10)

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def score_local(self, embedding: np.ndarray) -> float:
        """kNN anomaly score via EdgeShard query.

        Queries both mutable and immutable shards, merges results,
        returns ``1 - mean(top-k cosine similarities)``.
        """
        req = SearchRequest(
            query=Query.Nearest(embedding.tolist()),
            limit=K_NEIGHBORS,
            with_payload=False,
        )

        results = list(self._mutable_shard.search(req))
        if self._immutable_shard:
            results.extend(self._immutable_shard.search(req))

        # Sort by score descending and take top-k
        results.sort(key=lambda x: x.score, reverse=True)
        top_k = results[:K_NEIGHBORS]

        if not top_k:
            logger.warning("No baseline vectors; returning score 0.0")
            return 0.0

        sims = [r.score for r in top_k]
        score = 1.0 - float(np.mean(sims))

        self.total_scored += 1
        return round(score, 6)

    def should_escalate(self, score: float) -> bool:
        return score > ESCALATION_THRESHOLD

    # ------------------------------------------------------------------
    # Store clip embedding (mutable shard + upload queue)
    # ------------------------------------------------------------------

    def store_clip(
        self,
        embedding: np.ndarray,
        metadata: dict | None = None,
        anomaly_score: float = 0.0,
    ) -> str:
        """Store a clip embedding in the mutable shard and queue for cloud sync."""
        clip_id = uuid.uuid4().hex
        vector = embedding.tolist()
        payload = metadata or {}
        payload[SYNC_TIMESTAMP_KEY] = time.time()
        payload["anomaly_score"] = anomaly_score
        payload["synced"] = False

        self._mutable_shard.update(
            UpdateOperation.upsert_points(
                [Point(id=clip_id, vector=vector, payload=payload)]
            )
        )
        self._upload_queue.put({"id": clip_id, "vector": vector, "payload": payload})
        return clip_id

    # ------------------------------------------------------------------
    # Mutable shard retention
    # ------------------------------------------------------------------

    def _start_retention_worker(self) -> None:
        """Start background thread for mutable shard eviction."""
        if RETENTION_STRATEGY == "none":
            return
        self._retention_running = True
        self._retention_thread = threading.Thread(
            target=self._retention_worker, daemon=True
        )
        self._retention_thread.start()

    def _retention_worker(self) -> None:
        while self._retention_running:
            try:
                self._apply_retention()
            except Exception as exc:
                logger.warning("Retention cycle failed: %s", exc)
            time.sleep(RETENTION_CHECK_INTERVAL_S)

    def _apply_retention(self) -> None:
        """Apply the configured retention strategy to the mutable shard."""
        if RETENTION_STRATEGY == "time_window":
            self._evict_by_time()
        elif RETENTION_STRATEGY == "score_priority":
            self._evict_by_score_priority()

    def _evict_by_time(self) -> None:
        """Option B: Evict points older than RETENTION_SECONDS.

        Points are removed from search but remain in the upload queue
        for cloud sync. If a clip hasn't been synced yet, its embedding
        and metadata are preserved in the SQLite-backed queue.
        """
        cutoff = time.time() - RETENTION_SECONDS
        self._mutable_shard.update(
            UpdateOperation.delete_points_by_filter(
                Filter(
                    must=[
                        FieldCondition(
                            key=SYNC_TIMESTAMP_KEY,
                            range=RangeFloat(lte=cutoff),
                        )
                    ]
                )
            )
        )
        logger.info(
            "time_window retention: evicted points older than %ds", RETENTION_SECONDS
        )

    def _evict_by_score_priority(self) -> None:
        """Option C: Keep top RETENTION_MAX_POINTS by anomaly score.

        Unsynced points above the escalation threshold are pinned (never
        evicted until synced). Remaining slots are filled by recency.
        """
        all_points = list(self._mutable_shard.scroll(with_payload=True, with_vectors=False))
        if len(all_points) <= RETENTION_MAX_POINTS:
            return

        # Partition: pinned (unsynced anomalies) vs. evictable
        pinned = []
        evictable = []
        for pt in all_points:
            score = pt.payload.get("anomaly_score", 0.0)
            synced = pt.payload.get("synced", False)
            if not synced and score > ESCALATION_THRESHOLD:
                pinned.append(pt)
            else:
                evictable.append(pt)

        # Sort evictable by timestamp ascending (oldest first)
        evictable.sort(key=lambda p: p.payload.get(SYNC_TIMESTAMP_KEY, 0))

        # How many evictable points to keep
        keep_count = max(0, RETENTION_MAX_POINTS - len(pinned))
        to_evict = evictable[:max(0, len(evictable) - keep_count)]

        if not to_evict:
            return

        ids_to_delete = [pt.id for pt in to_evict]
        self._mutable_shard.update(
            UpdateOperation.delete_points(ids_to_delete)
        )
        logger.info(
            "score_priority retention: evicted %d points, pinned %d anomalies",
            len(ids_to_delete),
            len(pinned),
        )

    # ------------------------------------------------------------------
    # Escalation
    # ------------------------------------------------------------------

    async def escalate_to_cloud(
        self,
        clip_path: str,
        edge_embedding: np.ndarray,
        edge_score: float,
    ) -> Optional[dict[str, Any]]:
        """Send clip + metadata to cloud API. Queue offline if unreachable."""
        self.total_escalated += 1
        payload = {
            "edge_score": edge_score,
            "embedding": edge_embedding.tolist(),
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                headers = {}
                if CLOUD_API_KEY:
                    headers["Authorization"] = f"Bearer {CLOUD_API_KEY}"

                with open(clip_path, "rb") as f:
                    resp = await client.post(
                        f"{CLOUD_API_URL}/api/escalate",
                        headers=headers,
                        data={"metadata": json.dumps(payload)},
                        files={"clip": (Path(clip_path).name, f, "video/mp4")},
                    )
                resp.raise_for_status()
                logger.info("Escalated clip %s (score=%.4f)", clip_path, edge_score)
                return resp.json()
        except Exception as exc:
            logger.warning("Cloud unreachable (%s); queuing offline", exc)
            self._queue_offline(clip_path, payload)
            return None

    def _queue_offline(self, clip_path: str, payload: dict) -> None:
        entry = {"clip_path": clip_path, "payload": payload}
        out = self._offline_dir / f"{uuid.uuid4().hex}.json"
        out.write_text(json.dumps(entry))

    async def flush_offline_queue(self) -> int:
        """Attempt to send all queued escalations. Returns count of flushed."""
        flushed = 0
        for p in sorted(self._offline_dir.glob("*.json")):
            try:
                entry = json.loads(p.read_text())
                clip = entry["clip_path"]
                emb = np.array(entry["payload"]["embedding"], dtype=np.float32)
                score = entry["payload"]["edge_score"]
                result = await self.escalate_to_cloud(clip, emb, score)
                if result is not None:
                    p.unlink(missing_ok=True)
                    flushed += 1
            except Exception as exc:
                logger.warning("Failed to flush %s: %s", p.name, exc)
                break  # cloud likely still down
        return flushed

    # ------------------------------------------------------------------
    # Baseline ingestion (bulk load into mutable shard)
    # ------------------------------------------------------------------

    def ingest_baseline(
        self,
        embeddings: list[np.ndarray],
        metadata: Optional[list[dict]] = None,
    ) -> int:
        """Insert baseline embeddings into local mutable shard."""
        if not embeddings:
            return 0

        points = []
        for i, emb in enumerate(embeddings):
            pid = uuid.uuid4().hex
            meta = metadata[i] if metadata and i < len(metadata) else {}
            meta[SYNC_TIMESTAMP_KEY] = time.time()
            points.append(Point(id=pid, vector=emb.tolist(), payload=meta))

        self._mutable_shard.update(UpdateOperation.upsert_points(points))
        logger.info("Ingested %d baseline vectors into mutable shard", len(points))
        return len(points)

    # ------------------------------------------------------------------
    # Server sync (pull indexed baseline from cloud)
    # ------------------------------------------------------------------

    def sync_from_server(self, full: bool = False) -> None:
        """Download indexed shard snapshot from cloud server.

        full=True:  download complete snapshot (first sync)
        full=False: incremental partial snapshot (requires prior full sync)
        """
        import tempfile
        import shutil
        import requests

        self.stop_sync()

        # Flush pending uploads first
        items = []
        while self._upload_queue.size > 0:
            try:
                items.append(self._upload_queue.get(block=False))
            except Exception:
                break
        if items:
            self._upload_batch(items)

        headers = {}
        if CLOUD_API_KEY:
            headers["Authorization"] = f"Bearer {CLOUD_API_KEY}"

        sync_timestamp = time.time()

        with tempfile.TemporaryDirectory(dir=str(self._data_dir)) as temp_dir:
            snapshot_path = Path(temp_dir) / "shard.snapshot"

            if full or not self._immutable_shard:
                # Full sync
                resp = requests.post(
                    f"{CLOUD_API_URL}/api/snapshots/full",
                    headers=headers,
                    stream=True,
                    timeout=120,
                )
                resp.raise_for_status()
                with open(snapshot_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)

                self._immutable_shard = None
                if self._immutable_dir.exists():
                    shutil.rmtree(self._immutable_dir)
                self._immutable_dir.mkdir(parents=True, exist_ok=True)
                EdgeShard.unpack_snapshot(str(snapshot_path), str(self._immutable_dir))
                self._immutable_shard = EdgeShard(str(self._immutable_dir), None)
            else:
                # Incremental sync
                manifest = self._immutable_shard.snapshot_manifest()
                resp = requests.post(
                    f"{CLOUD_API_URL}/api/snapshots/partial",
                    json={"manifest": manifest},
                    headers=headers,
                    stream=True,
                    timeout=120,
                )
                resp.raise_for_status()
                with open(snapshot_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                self._immutable_shard.update_from_snapshot(str(snapshot_path))

        # Clean synced points from mutable shard
        self._mutable_shard.update(
            UpdateOperation.delete_points_by_filter(
                Filter(
                    must=[
                        FieldCondition(
                            key=SYNC_TIMESTAMP_KEY,
                            range=RangeFloat(lte=sync_timestamp),
                        )
                    ]
                )
            )
        )

        logger.info("Synced %s from server", "full snapshot" if full else "partial update")
        self._start_sync_worker()

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def baseline_count(self) -> int:
        # EdgeShard doesn't expose count directly; return -1 as unknown
        return -1

    def close(self) -> None:
        self.stop_sync()
        self._retention_running = False
        if self._retention_thread:
            self._retention_thread.join(timeout=10)
