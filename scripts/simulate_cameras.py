#!/usr/bin/env python3
"""Simulate multiple camera feeds using UCF-Crime test videos.

Plays back test videos simultaneously, feeding clips to the anomaly detection
pipeline in real-time, and displays a rich terminal UI with per-camera scores.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv"}


@dataclass
class CameraFeed:
    camera_id: int
    video_path: Path
    anomaly_type: str
    clips: list[dict] = field(default_factory=list)
    current_clip_idx: int = 0
    anomaly_score: float = 0.0
    is_anomaly: bool = False
    scores_history: list[float] = field(default_factory=list)
    escalated: bool = False


@dataclass
class Incident:
    incident_id: str
    camera_id: int
    anomaly_type: str
    start_time: float
    scores: list[float] = field(default_factory=list)
    escalated: bool = False


def discover_test_videos(data_dir: Path) -> dict[str, list[Path]]:
    """Find test videos grouped by anomaly type."""
    test_dir = data_dir / "test"
    if not test_dir.exists():
        return {}

    by_type: dict[str, list[Path]] = {}
    for atype_dir in sorted(test_dir.iterdir()):
        if not atype_dir.is_dir():
            continue
        videos = [f for f in atype_dir.iterdir() if f.suffix.lower() in VIDEO_EXTENSIONS]
        if videos:
            by_type[atype_dir.name] = sorted(videos)
    return by_type


def load_clips_for_video(manifest_path: Path, video_name: str) -> list[dict]:
    """Load clips for a specific video from the manifest."""
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text())
    return [c for c in manifest["clips"] if c["source_video"] == video_name]


def select_camera_feeds(
    videos_by_type: dict[str, list[Path]],
    num_cameras: int,
    anomaly_ratio: float,
    manifest_path: Path,
) -> list[CameraFeed]:
    """Select videos for camera simulation with a target anomaly ratio."""
    num_anomaly = max(1, int(num_cameras * anomaly_ratio))
    num_normal = num_cameras - num_anomaly

    feeds = []
    cam_id = 0

    # Anomalous feeds
    anomaly_types = [k for k in videos_by_type if k != "Normal"]
    anomaly_videos = []
    for atype in anomaly_types:
        anomaly_videos.extend([(v, atype) for v in videos_by_type[atype]])
    random.shuffle(anomaly_videos)

    for video_path, atype in anomaly_videos[:num_anomaly]:
        clips = load_clips_for_video(manifest_path, video_path.name)
        feeds.append(CameraFeed(
            camera_id=cam_id,
            video_path=video_path,
            anomaly_type=atype,
            clips=clips,
        ))
        cam_id += 1

    # Normal feeds
    normal_videos = videos_by_type.get("Normal", [])
    random.shuffle(normal_videos)
    for video_path in normal_videos[:num_normal]:
        clips = load_clips_for_video(manifest_path, video_path.name)
        feeds.append(CameraFeed(
            camera_id=cam_id,
            video_path=video_path,
            anomaly_type="Normal",
            clips=clips,
        ))
        cam_id += 1

    return feeds


def score_clip_mock(clip: dict, model_type: str = "edge") -> float:
    """Mock scoring: simulate anomaly score based on ground truth.

    In production, this would call the actual embedding + kNN pipeline.
    For demo purposes, anomalous clips get higher scores with noise.
    """
    atype = clip.get("anomaly_type", "Normal")
    if atype == "Normal":
        return max(0.0, min(1.0, random.gauss(0.02, 0.015)))
    else:
        return max(0.0, min(1.0, random.gauss(0.15, 0.08)))


def try_score_clip_real(clip: dict, data_dir: Path, model_type: str = "edge") -> float | None:
    """Attempt real scoring via the embedding pipeline."""
    try:
        emb_file = data_dir / f"embeddings_{model_type}.npz"
        meta_file = data_dir / f"embeddings_{model_type}_meta.json"
        if not emb_file.exists():
            return None

        loaded = np.load(emb_file)
        meta = json.loads(meta_file.read_text())

        clip_id = clip["clip_id"]
        for i, m in enumerate(meta):
            if m["clip_id"] == clip_id:
                embedding = loaded["embeddings"][i]
                # Score against Qdrant if available
                try:
                    from backend.anomaly import score_clip
                    result = score_clip(
                        embedding.tolist(),
                        collection_name="ucf_crime_baseline",
                    )
                    return result.anomaly_score
                except Exception:
                    return None
        return None
    except Exception:
        return None


def render_dashboard(
    feeds: list[CameraFeed],
    incidents: list[Incident],
    elapsed: float,
    speed: float,
) -> str:
    """Render a terminal dashboard showing all camera feeds."""
    lines = []
    lines.append("\033[2J\033[H")  # clear screen
    lines.append("=" * 80)
    lines.append(f"  VIDEO ANOMALY DETECTION - CAMERA SIMULATOR  |  "
                 f"Elapsed: {elapsed:.0f}s  Speed: {speed}x")
    lines.append("=" * 80)
    lines.append("")

    for feed in feeds:
        score = feed.anomaly_score
        bar_len = int(score * 30)
        bar = "\033[91m" + "#" * bar_len + "\033[0m" + "-" * (30 - bar_len)

        status = "\033[92mOK\033[0m"
        if feed.is_anomaly:
            status = "\033[91mANOMALY\033[0m"
        if feed.escalated:
            status = "\033[93mESCALATED\033[0m"

        clip_info = f"clip {feed.current_clip_idx}/{len(feed.clips)}" if feed.clips else "no clips"
        lines.append(
            f"  CAM-{feed.camera_id:02d} [{feed.anomaly_type:15s}] "
            f"[{bar}] {score:.3f} {status}  ({clip_info})"
        )

    lines.append("")
    lines.append("-" * 80)
    lines.append(f"  Active Incidents: {len([i for i in incidents if not i.escalated])}"
                 f"  |  Escalated: {len([i for i in incidents if i.escalated])}")

    for inc in incidents[-5:]:  # show last 5
        esc_tag = " [ESCALATED]" if inc.escalated else ""
        avg = sum(inc.scores) / len(inc.scores) if inc.scores else 0
        lines.append(
            f"    #{inc.incident_id[:8]} CAM-{inc.camera_id:02d} "
            f"type={inc.anomaly_type} avg_score={avg:.3f}{esc_tag}"
        )

    lines.append("-" * 80)
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Simulate camera feeds from UCF-Crime test videos",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/ucf_crime"),
    )
    parser.add_argument(
        "--num-cameras",
        type=int,
        default=8,
        help="Number of simulated cameras (default: 8)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=4.0,
        help="Playback speed multiplier (default: 4x)",
    )
    parser.add_argument(
        "--anomaly-ratio",
        type=float,
        default=0.3,
        help="Ratio of anomalous camera feeds (default: 0.3)",
    )
    parser.add_argument(
        "--escalation-threshold",
        type=float,
        default=0.06,
        help="Score threshold for escalation (default: 0.06)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=120.0,
        help="Simulation duration in seconds (default: 120)",
    )
    parser.add_argument(
        "--use-real-scoring",
        action="store_true",
        help="Attempt real embedding+kNN scoring (requires indexed data)",
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
    manifest_path = data_dir / "clip_manifest.json"

    # Discover test videos
    videos_by_type = discover_test_videos(data_dir)
    if not videos_by_type:
        logger.error("No test videos found in %s/test/. Run download_ucf_crime.py first.", data_dir)
        sys.exit(1)

    total_videos = sum(len(v) for v in videos_by_type.values())
    logger.info("Found %d test videos across %d categories", total_videos, len(videos_by_type))

    # Set up camera feeds
    feeds = select_camera_feeds(videos_by_type, args.num_cameras, args.anomaly_ratio, manifest_path)
    if not feeds:
        logger.error("Could not set up camera feeds")
        sys.exit(1)

    logger.info("Simulating %d cameras (%.0f%% anomalous)", len(feeds), args.anomaly_ratio * 100)

    incidents: list[Incident] = []
    active_incidents: dict[int, Incident] = {}  # camera_id -> current incident

    clip_interval = 10.0 / args.speed  # real seconds per clip
    t_start = time.time()
    sim_time = 0.0

    try:
        while sim_time < args.duration:
            loop_start = time.time()

            for feed in feeds:
                if feed.current_clip_idx >= len(feed.clips):
                    continue

                clip = feed.clips[feed.current_clip_idx]

                # Score
                score = None
                if args.use_real_scoring:
                    score = try_score_clip_real(clip, data_dir)
                if score is None:
                    score = score_clip_mock(clip)

                feed.anomaly_score = score
                feed.scores_history.append(score)
                feed.is_anomaly = score > args.escalation_threshold

                # Incident management
                if feed.is_anomaly:
                    if feed.camera_id not in active_incidents:
                        import uuid
                        inc = Incident(
                            incident_id=str(uuid.uuid4()),
                            camera_id=feed.camera_id,
                            anomaly_type=feed.anomaly_type,
                            start_time=sim_time,
                        )
                        active_incidents[feed.camera_id] = inc
                        incidents.append(inc)

                    active_incidents[feed.camera_id].scores.append(score)

                    # Escalate after 3 consecutive anomalous clips
                    inc = active_incidents[feed.camera_id]
                    if len(inc.scores) >= 3 and not inc.escalated:
                        inc.escalated = True
                        feed.escalated = True
                        logger.debug("Escalated: CAM-%02d (%s)", feed.camera_id, feed.anomaly_type)
                else:
                    if feed.camera_id in active_incidents:
                        del active_incidents[feed.camera_id]
                    feed.escalated = False

                feed.current_clip_idx += 1

            # Render
            elapsed = time.time() - t_start
            dashboard = render_dashboard(feeds, incidents, elapsed, args.speed)
            print(dashboard, flush=True)

            # Wait for next tick
            loop_elapsed = time.time() - loop_start
            sleep_time = max(0, clip_interval - loop_elapsed)
            time.sleep(sleep_time)
            sim_time += clip_interval

    except KeyboardInterrupt:
        print("\nSimulation interrupted.")

    # Summary
    print("\n" + "=" * 80)
    print("  SIMULATION SUMMARY")
    print("=" * 80)
    print(f"  Duration: {sim_time:.0f}s simulated ({time.time() - t_start:.0f}s real)")
    print(f"  Cameras: {len(feeds)}")
    print(f"  Total incidents: {len(incidents)}")
    print(f"  Escalations: {len([i for i in incidents if i.escalated])}")
    print()

    for feed in feeds:
        avg = sum(feed.scores_history) / len(feed.scores_history) if feed.scores_history else 0
        print(f"  CAM-{feed.camera_id:02d} [{feed.anomaly_type:15s}] "
              f"avg_score={avg:.4f} clips={feed.current_clip_idx}")
    print("=" * 80)


if __name__ == "__main__":
    main()
