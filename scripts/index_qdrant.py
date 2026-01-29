#!/usr/bin/env python3
"""Index UCF-Crime embeddings into Qdrant for kNN anomaly detection.

Supports both cloud (remote Qdrant) and edge (local storage) modes.
For edge mode, selects a representative subset via k-means clustering.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

COLLECTION_NAME = os.getenv("UCF_COLLECTION_NAME", "ucf_crime_baseline")


def get_qdrant_client(mode: str, edge_path: str | None = None):
    """Create a Qdrant client for the specified mode."""
    from qdrant_client import QdrantClient

    if mode == "cloud":
        url = os.getenv("QDRANT_URL", "http://localhost:6333")
        api_key = os.getenv("QDRANT_API_KEY")
        logger.info("Connecting to cloud Qdrant: %s", url)
        return QdrantClient(url=url, api_key=api_key if api_key else None)
    else:
        path = edge_path or os.getenv("QDRANT_EDGE_PATH", "data/ucf_crime/qdrant_edge")
        logger.info("Using local Qdrant storage: %s", path)
        return QdrantClient(path=path)


def create_collection(client, collection_name: str, vector_size: int) -> None:
    """Create or recreate the Qdrant collection."""
    from qdrant_client.models import Distance, VectorParams

    collections = [c.name for c in client.get_collections().collections]
    if collection_name in collections:
        logger.info("Deleting existing collection: %s", collection_name)
        client.delete_collection(collection_name)

    logger.info("Creating collection '%s' (dim=%d, cosine)", collection_name, vector_size)
    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )


def select_representative_subset(
    embeddings: np.ndarray,
    meta: list[dict],
    n_representatives: int = 500,
) -> tuple[np.ndarray, list[dict]]:
    """Select representative normal embeddings via k-means clustering."""
    from sklearn.cluster import MiniBatchKMeans

    if len(embeddings) <= n_representatives:
        return embeddings, meta

    logger.info("Clustering %d embeddings into %d representatives...", len(embeddings), n_representatives)
    kmeans = MiniBatchKMeans(n_clusters=n_representatives, random_state=42, batch_size=256)
    kmeans.fit(embeddings)

    # For each cluster, pick the embedding closest to the centroid
    labels = kmeans.labels_
    selected_indices = []
    for k in range(n_representatives):
        mask = labels == k
        if not mask.any():
            continue
        cluster_indices = np.where(mask)[0]
        centroid = kmeans.cluster_centers_[k]
        dists = np.linalg.norm(embeddings[cluster_indices] - centroid, axis=1)
        best = cluster_indices[np.argmin(dists)]
        selected_indices.append(best)

    selected_indices = sorted(selected_indices)
    logger.info("Selected %d representative embeddings", len(selected_indices))
    return embeddings[selected_indices], [meta[i] for i in selected_indices]


def index_embeddings(
    client,
    collection_name: str,
    embeddings: np.ndarray,
    meta: list[dict],
    batch_size: int = 100,
) -> None:
    """Upload embeddings with metadata to Qdrant."""
    from qdrant_client.models import PointStruct

    total = len(embeddings)
    logger.info("Indexing %d embeddings into '%s'...", total, collection_name)

    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        points = []
        for i in range(start, end):
            m = meta[i]
            point = PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, m["clip_id"])),
                vector=embeddings[i].tolist(),
                payload={
                    "clip_id": m["clip_id"],
                    "source_video": m.get("source_video", ""),
                    "anomaly_type": m.get("anomaly_type", "Normal"),
                    "scene_id": m.get("source_video", "").split("_")[0] if m.get("source_video") else "",
                    "time_bucket": int(m.get("start_time", 0) // 60),
                    "is_training": m.get("is_training", True),
                },
            )
            points.append(point)

        client.upsert(collection_name=collection_name, points=points)

        if (start // batch_size) % 10 == 0:
            logger.info("Indexed %d/%d", end, total)

    logger.info("Indexing complete: %d points in '%s'", total, collection_name)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Index UCF-Crime embeddings into Qdrant",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/ucf_crime"),
    )
    parser.add_argument(
        "--mode",
        choices=["cloud", "edge"],
        default="cloud",
        help="cloud: remote Qdrant server, edge: local file storage",
    )
    parser.add_argument(
        "--model",
        choices=["cloud", "edge"],
        default="cloud",
        help="Which embeddings to index (cloud=768d, edge=576d)",
    )
    parser.add_argument(
        "--edge-path",
        type=str,
        default=None,
        help="Local Qdrant storage path (edge mode only)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        default=COLLECTION_NAME,
        help=f"Collection name (default: {COLLECTION_NAME})",
    )
    parser.add_argument(
        "--training-only",
        action="store_true",
        default=True,
        help="Only index training set as normal baseline (default: True)",
    )
    parser.add_argument(
        "--representative-subset",
        type=int,
        default=0,
        help="For edge: select N representative normals via k-means (0=all)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    data_dir = args.data_dir.resolve()
    emb_file = data_dir / f"embeddings_{args.model}.npz"
    meta_file = data_dir / f"embeddings_{args.model}_meta.json"

    if not emb_file.exists() or not meta_file.exists():
        logger.error("Embeddings not found. Run embed_clips.py first.")
        logger.error("Expected: %s and %s", emb_file, meta_file)
        sys.exit(1)

    # Load embeddings
    loaded = np.load(emb_file)
    embeddings = loaded["embeddings"]
    meta = json.loads(meta_file.read_text())
    logger.info("Loaded %d embeddings (dim=%d)", len(embeddings), embeddings.shape[1])

    # Filter to training set normals if requested
    if args.training_only:
        indices = [i for i, m in enumerate(meta) if m.get("is_training", False)]
        embeddings = embeddings[indices]
        meta = [meta[i] for i in indices]
        logger.info("Filtered to %d training embeddings", len(embeddings))

    # For edge mode, optionally select representative subset
    n_rep = args.representative_subset
    if args.mode == "edge" and n_rep == 0:
        n_rep = 500  # default for edge
    if n_rep > 0:
        embeddings, meta = select_representative_subset(embeddings, meta, n_rep)

    # Connect and index
    vector_size = embeddings.shape[1]
    client = get_qdrant_client(args.mode, args.edge_path)
    create_collection(client, args.collection, vector_size)
    index_embeddings(client, args.collection, embeddings, meta)

    # Verify
    info = client.get_collection(args.collection)
    logger.info("Collection '%s': %d points, dim=%d",
                args.collection, info.points_count, vector_size)


if __name__ == "__main__":
    main()
