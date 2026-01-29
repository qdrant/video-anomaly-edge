"""NVIDIA Metropolis VSS integration for video upload and chunking.

Follows the pattern from:
- twelvelabs-nvidia-vss-sample/rtsp-stream-worker/main.py (chunking + upload)
- nvidia-vss/deploy/docker/twelve_labs_deployment/ (config)
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import aiohttp
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

NVIDIA_VSS_BASE_URL = os.getenv("NVIDIA_VSS_BASE_URL", "http://localhost:8080")
VSS_ENABLED = os.getenv("VSS_ENABLED", "false").lower() == "true"
VSS_UPLOAD_TIMEOUT = int(os.getenv("VSS_UPLOAD_TIMEOUT", "3000"))


def is_enabled() -> bool:
    return VSS_ENABLED


# ---------------------------------------------------------------------------
# Chunking (pattern from rtsp-stream-worker/main.py lines 646-703)
# ---------------------------------------------------------------------------


def chunk_video(
    input_path: str | Path,
    output_dir: str | Path,
    chunk_duration_s: float | None = None,
) -> list[Path]:
    """Split a video into chunks using FFmpeg segment muxer.

    If chunk_duration_s is None, auto-calculates based on video duration:
    - Videos < 60s: no chunking
    - Videos >= 60s: split into ~30 chunks
    """
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Get video duration
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)],
        capture_output=True, text=True,
    )
    duration = float(probe.stdout.strip()) if probe.stdout.strip() else 60.0

    if chunk_duration_s is None:
        if duration < 60:
            chunk_duration_s = duration  # Don't chunk short videos
        else:
            chunk_duration_s = duration / 30  # ~30 chunks

    pattern = output_dir / f"{input_path.stem}_chunk_%04d.mp4"

    subprocess.run(
        ["ffmpeg", "-y", "-i", str(input_path),
         "-c", "copy", "-map", "0",
         "-segment_time", str(chunk_duration_s),
         "-f", "segment", "-reset_timestamps", "1",
         str(pattern)],
        capture_output=True,
    )

    chunks = sorted(output_dir.glob(f"{input_path.stem}_chunk_*.mp4"))
    logger.info("Chunked %s into %d segments (%.1fs each)", input_path.name, len(chunks), chunk_duration_s)
    return chunks


# ---------------------------------------------------------------------------
# VSS Upload (pattern from rtsp-stream-worker/main.py lines 479-532)
# ---------------------------------------------------------------------------


async def upload_to_vss(file_path: str | Path) -> Optional[str]:
    """Upload a single video file to NVIDIA VSS.

    Returns the VSS file ID on success, None on failure.
    """
    file_path = Path(file_path)

    timeout = aiohttp.ClientTimeout(total=VSS_UPLOAD_TIMEOUT)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        data = aiohttp.FormData()
        data.add_field(
            "file",
            open(file_path, "rb"),
            filename=file_path.name,
            content_type="video/mp4",
        )
        data.add_field("purpose", "vision")
        data.add_field("media_type", "video")

        try:
            async with session.post(f"{NVIDIA_VSS_BASE_URL}/files", data=data) as resp:
                if resp.status == 200:
                    body = await resp.json()
                    file_id = body.get("id")
                    logger.info("Uploaded %s to VSS: id=%s", file_path.name, file_id)
                    return file_id
                else:
                    text = await resp.text()
                    logger.error("VSS upload failed (%d): %s", resp.status, text)
                    return None
        except Exception as exc:
            logger.error("VSS upload error for %s: %s", file_path.name, exc)
            return None


async def upload_chunks_to_vss(chunk_paths: list[Path]) -> list[str]:
    """Upload multiple chunks to VSS in parallel.

    Pattern from rtsp-stream-worker/main.py lines 705-747.
    Returns list of VSS file IDs for successful uploads.
    """
    tasks = [upload_to_vss(p) for p in chunk_paths]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    file_ids = []
    for i, result in enumerate(results):
        if isinstance(result, str):
            file_ids.append(result)
        elif isinstance(result, Exception):
            logger.error("Chunk upload failed for %s: %s", chunk_paths[i].name, result)
        # None results are already logged in upload_to_vss

    logger.info("Uploaded %d/%d chunks to VSS", len(file_ids), len(chunk_paths))
    return file_ids


# ---------------------------------------------------------------------------
# Full pipeline: chunk + upload
# ---------------------------------------------------------------------------


async def ingest_video(file_path: str | Path) -> dict:
    """Full VSS ingestion pipeline: chunk video, upload all chunks.

    Returns dict with chunk count, file IDs, and status.
    """
    if not is_enabled():
        return {"status": "disabled", "message": "VSS_ENABLED is false"}

    file_path = Path(file_path)
    if not file_path.exists():
        return {"status": "error", "message": f"File not found: {file_path}"}

    with tempfile.TemporaryDirectory(prefix="vss_chunks_") as tmp_dir:
        chunks = chunk_video(file_path, tmp_dir)
        if not chunks:
            return {"status": "error", "message": "Chunking produced no output"}

        file_ids = await upload_chunks_to_vss(chunks)

    return {
        "status": "ok",
        "total_chunks": len(chunks),
        "uploaded_chunks": len(file_ids),
        "vss_file_ids": file_ids,
    }


# ---------------------------------------------------------------------------
# VSS health check
# ---------------------------------------------------------------------------


async def health() -> dict:
    """Check if VSS server is reachable."""
    if not is_enabled():
        return {"status": "disabled"}

    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{NVIDIA_VSS_BASE_URL}/health/ready") as resp:
                return {"status": "ok" if resp.status == 200 else "unhealthy"}
    except Exception as exc:
        return {"status": "unreachable", "error": str(exc)}
