#!/usr/bin/env python3
"""Segment UCF-Crime videos into fixed-length clips using ffmpeg.

Splits each video into 10-second clips, preserving directory structure.
Generates a clip manifest JSON for downstream processing.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

CLIP_DURATION = 10  # seconds
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov"}


@dataclass
class ClipInfo:
    clip_id: str
    source_video: str
    start_time: float
    duration: float
    anomaly_type: str
    is_training: bool
    clip_path: str


def get_video_duration(video_path: Path) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(video_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except (subprocess.CalledProcessError, KeyError, json.JSONDecodeError) as e:
        logger.warning("Could not probe %s: %s", video_path, e)
        return 0.0


def segment_video(
    video_path: Path,
    output_dir: Path,
    clip_duration: int,
    anomaly_type: str,
    is_training: bool,
) -> list[ClipInfo]:
    """Segment a single video into clips. Returns list of ClipInfo."""
    duration = get_video_duration(video_path)
    if duration <= 0:
        logger.warning("Skipping zero-duration video: %s", video_path)
        return []

    stem = video_path.stem
    output_dir.mkdir(parents=True, exist_ok=True)
    clips = []

    num_clips = max(1, int(duration // clip_duration))
    # Include a final partial clip if remaining > 2 seconds
    remainder = duration - (num_clips * clip_duration)
    if remainder > 2.0:
        num_clips += 1

    for i in range(num_clips):
        start = i * clip_duration
        clip_id = f"{stem}_clip{i:04d}"
        clip_filename = f"{clip_id}.mp4"
        clip_path = output_dir / clip_filename

        if clip_path.exists() and clip_path.stat().st_size > 1000:
            # Resume: skip already-processed clips
            clips.append(ClipInfo(
                clip_id=clip_id,
                source_video=video_path.name,
                start_time=float(start),
                duration=min(clip_duration, duration - start),
                anomaly_type=anomaly_type,
                is_training=is_training,
                clip_path=str(clip_path),
            ))
            continue

        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(start),
            "-i", str(video_path),
            "-t", str(clip_duration),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-an",  # no audio
            "-loglevel", "error",
            str(clip_path),
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            logger.warning("ffmpeg failed for %s at %ds: %s", video_path.name, start, e.stderr[:200] if e.stderr else "")
            continue

        clips.append(ClipInfo(
            clip_id=clip_id,
            source_video=video_path.name,
            start_time=float(start),
            duration=min(clip_duration, duration - start),
            anomaly_type=anomaly_type,
            is_training=is_training,
            clip_path=str(clip_path),
        ))

    return clips


def process_video_task(args_tuple: tuple) -> list[dict]:
    """Worker function for parallel processing."""
    video_path, output_dir, clip_duration, anomaly_type, is_training = args_tuple
    clips = segment_video(
        Path(video_path), Path(output_dir), clip_duration, anomaly_type, is_training
    )
    return [asdict(c) for c in clips]


def discover_videos(data_dir: Path, split: str) -> list[tuple[Path, str, bool]]:
    """Find all videos in a split directory. Returns (path, anomaly_type, is_training)."""
    split_dir = data_dir / split
    if not split_dir.exists():
        return []

    is_training = split == "train"
    results = []
    for atype_dir in sorted(split_dir.iterdir()):
        if not atype_dir.is_dir():
            continue
        anomaly_type = atype_dir.name
        for vf in sorted(atype_dir.iterdir()):
            if vf.suffix.lower() in VIDEO_EXTENSIONS:
                results.append((vf, anomaly_type, is_training))
    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Segment UCF-Crime videos into fixed-length clips",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/ucf_crime"),
        help="UCF-Crime data directory (default: data/ucf_crime)",
    )
    parser.add_argument(
        "--clip-duration",
        type=int,
        default=CLIP_DURATION,
        help=f"Clip duration in seconds (default: {CLIP_DURATION})",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel workers (default: 4)",
    )
    parser.add_argument(
        "--splits",
        nargs="+",
        default=["train", "test"],
        help="Splits to process (default: train test)",
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
    clips_dir = data_dir / "clips"
    all_clips: list[dict] = []

    # Collect all tasks
    tasks = []
    for split in args.splits:
        videos = discover_videos(data_dir, split)
        logger.info("Found %d videos in %s split", len(videos), split)
        for video_path, anomaly_type, is_training in videos:
            out_dir = clips_dir / split / anomaly_type
            tasks.append((
                str(video_path),
                str(out_dir),
                args.clip_duration,
                anomaly_type,
                is_training,
            ))

    if not tasks:
        logger.error("No videos found in %s. Run download_ucf_crime.py first.", data_dir)
        return

    logger.info("Segmenting %d videos with %d workers...", len(tasks), args.workers)

    completed = 0
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_video_task, t): t for t in tasks}
        for future in as_completed(futures):
            completed += 1
            try:
                clips = future.result()
                all_clips.extend(clips)
                if completed % 50 == 0 or completed == len(tasks):
                    logger.info("Progress: %d/%d videos (%d clips so far)",
                                completed, len(tasks), len(all_clips))
            except Exception as e:
                task = futures[future]
                logger.error("Failed to process %s: %s", task[0], e)

    # Write manifest
    manifest_path = data_dir / "clip_manifest.json"
    manifest = {
        "total_clips": len(all_clips),
        "clip_duration_s": args.clip_duration,
        "clips": all_clips,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info("Manifest written: %s (%d clips)", manifest_path, len(all_clips))

    # Summary
    from collections import Counter
    type_counts = Counter(c["anomaly_type"] for c in all_clips)
    split_counts = Counter("train" if c["is_training"] else "test" for c in all_clips)
    logger.info("By split: %s", dict(split_counts))
    logger.info("By type: %s", dict(type_counts))


if __name__ == "__main__":
    main()
