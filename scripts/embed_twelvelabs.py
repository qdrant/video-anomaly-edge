"""Batch embed video clips via Twelve Labs Marengo and store in Qdrant.

Usage:
    uv run python scripts/embed_twelvelabs.py --input-dir data/clips --collection anomaly_baseline
"""

from __future__ import annotations

import argparse
import logging
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Batch embed clips via Twelve Labs")
    parser.add_argument("--input-dir", required=True, help="Directory of .mp4 clips")
    parser.add_argument("--collection", default="anomaly_baseline", help="Qdrant collection name")
    parser.add_argument("--qdrant-url", default="http://localhost:6333")
    parser.add_argument("--qdrant-api-key", default=None)
    parser.add_argument("--index-type", default="marengo", choices=["marengo", "both"])
    parser.add_argument("--dry-run", action="store_true", help="List files without uploading")
    args = parser.parse_args()

    # Import after dotenv so env vars are available
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from backend import twelvelabs_client

    if not twelvelabs_client.is_enabled():
        logger.error("TWELVE_LABS_API_KEY not set")
        sys.exit(1)

    input_dir = Path(args.input_dir)
    clips = sorted(input_dir.glob("*.mp4"))
    logger.info("Found %d clips in %s", len(clips), input_dir)

    if args.dry_run:
        for c in clips:
            print(c.name)
        return

    qdrant = QdrantClient(url=args.qdrant_url, api_key=args.qdrant_api_key)

    points: list[PointStruct] = []
    collection_created = False

    for i, clip_path in enumerate(clips):
        logger.info("[%d/%d] Uploading %s", i + 1, len(clips), clip_path.name)

        result = twelvelabs_client.upload_video(str(clip_path), index_type=args.index_type)
        video_id = result.get("marengo_video_id")
        if not video_id:
            logger.warning("No video ID returned for %s, skipping", clip_path.name)
            continue

        embedding = twelvelabs_client.get_video_embedding(video_id)
        if not embedding:
            logger.warning("No embedding for video %s, skipping", video_id)
            continue

        # Create collection on first successful embedding
        if not collection_created:
            dim = len(embedding)
            try:
                qdrant.get_collection(args.collection)
                logger.info("Collection %s already exists", args.collection)
            except Exception:
                qdrant.create_collection(
                    collection_name=args.collection,
                    vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
                )
                logger.info("Created collection %s (dim=%d)", args.collection, dim)
            collection_created = True

        point_id = str(uuid.uuid4())
        points.append(PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                "source_video": clip_path.stem,
                "twelvelabs_video_id": video_id,
                "clip_filename": clip_path.name,
            },
        ))

        # Batch upsert every 50 points
        if len(points) >= 50:
            qdrant.upsert(collection_name=args.collection, points=points)
            logger.info("Upserted %d points", len(points))
            points = []

    # Final batch
    if points:
        qdrant.upsert(collection_name=args.collection, points=points)
        logger.info("Upserted %d points (final batch)", len(points))

    logger.info("Done. Total clips processed: %d", len(clips))


if __name__ == "__main__":
    main()
