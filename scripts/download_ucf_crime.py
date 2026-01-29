#!/usr/bin/env python3
"""Download and organize the UCF-Crime dataset.

UCF-Crime contains 1,900 real-world surveillance videos across 13 anomaly
categories plus Normal videos, with pre-defined train/test splits.

Reference: https://www.crcv.ucf.edu/projects/real-world/
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ANOMALY_TYPES = [
    "Abuse",
    "Arrest",
    "Arson",
    "Assault",
    "Burglary",
    "Explosion",
    "Fighting",
    "RoadAccidents",
    "Robbery",
    "Shooting",
    "Shoplifting",
    "Stealing",
    "Vandalism",
]

# Google Drive file IDs for the UCF-Crime parts (publicly shared by UCF).
# The dataset is split into multiple parts. Users may need to download manually
# if automated download fails due to Google Drive quotas.
#
# Primary source: https://www.crcv.ucf.edu/projects/real-world/
# The dataset is also mirrored on various academic servers.
#
# Annotation files hosted directly:
ANNOTATIONS_URL = "https://www.crcv.ucf.edu/projects/real-world/"

# Split list URLs (text files listing train/test videos)
SPLIT_URLS = {
    "train": "https://www.crcv.ucf.edu/projects/real-world/Anomaly_Train.txt",
    "test": "https://www.crcv.ucf.edu/projects/real-world/Anomaly_Test.txt",
    "temporal_annotations": "https://www.crcv.ucf.edu/projects/real-world/Temporal_Anomaly_Annotation.txt",
}


def download_file(url: str, dest: Path, resume: bool = True) -> bool:
    """Download a file with wget, supporting resume."""
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and dest.stat().st_size > 0 and not resume:
        logger.info("Already exists: %s", dest)
        return True

    cmd = ["wget", "-q", "--show-progress"]
    if resume:
        cmd.append("-c")
    cmd.extend(["-O", str(dest), url])

    logger.info("Downloading %s -> %s", url, dest)
    try:
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError as e:
        logger.error("Download failed for %s: %s", url, e)
        return False
    except FileNotFoundError:
        logger.error("wget not found. Install it: brew install wget / apt install wget")
        return False


def download_with_gdown(file_id: str, dest: Path) -> bool:
    """Download from Google Drive using gdown (for large files)."""
    try:
        import gdown
    except ImportError:
        logger.error("gdown not installed. Run: uv pip install gdown")
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        logger.info("Already exists (>1MB): %s", dest)
        return True

    url = f"https://drive.google.com/uc?id={file_id}"
    logger.info("Downloading from Google Drive: %s -> %s", file_id, dest)
    try:
        gdown.download(url, str(dest), quiet=False)
        return True
    except Exception as e:
        logger.error("gdown download failed: %s", e)
        return False


def infer_anomaly_type(video_name: str) -> str:
    """Infer anomaly type from video filename.

    UCF-Crime filenames follow the pattern: AnomalyType_NNN_x264.mp4
    Normal videos: Normal_Videos_NNN_x264.mp4
    """
    name = Path(video_name).stem
    for atype in ANOMALY_TYPES:
        if name.startswith(atype):
            return atype
    if "normal" in name.lower():
        return "Normal"
    return "Unknown"


def parse_split_file(path: Path) -> list[str]:
    """Parse a split file into a list of video paths."""
    if not path.exists():
        return []
    lines = path.read_text().strip().splitlines()
    return [line.strip() for line in lines if line.strip()]


def organize_videos(raw_dir: Path, output_dir: Path, split_files: dict[str, Path]) -> None:
    """Organize downloaded videos into train/test with anomaly subfolders."""
    for split_name, split_file in split_files.items():
        video_list = parse_split_file(split_file)
        if not video_list:
            logger.warning("No videos in split file: %s", split_file)
            continue

        logger.info("Organizing %d videos for %s split", len(video_list), split_name)
        for video_path in video_list:
            video_name = Path(video_path).name
            atype = infer_anomaly_type(video_name)

            dest_dir = output_dir / split_name / atype
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Look for the video in raw_dir (may be nested)
            candidates = list(raw_dir.rglob(video_name))
            if not candidates:
                logger.debug("Video not found locally: %s", video_name)
                continue

            src = candidates[0]
            dest = dest_dir / video_name
            if not dest.exists():
                shutil.copy2(src, dest)
                logger.debug("Copied %s -> %s", src, dest)


def create_directory_structure(output_dir: Path) -> None:
    """Pre-create the expected directory structure."""
    for split in ["train", "test"]:
        for atype in ANOMALY_TYPES + ["Normal"]:
            (output_dir / split / atype).mkdir(parents=True, exist_ok=True)
    (output_dir / "clips" / "train").mkdir(parents=True, exist_ok=True)
    (output_dir / "clips" / "test").mkdir(parents=True, exist_ok=True)
    (output_dir / "embeddings").mkdir(parents=True, exist_ok=True)
    (output_dir / "evaluation").mkdir(parents=True, exist_ok=True)


def download_split_lists(output_dir: Path) -> dict[str, Path]:
    """Download train/test split text files."""
    split_files = {}
    meta_dir = output_dir / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)

    for name, url in SPLIT_URLS.items():
        dest = meta_dir / f"{name}.txt"
        if download_file(url, dest, resume=False):
            split_files[name] = dest
        else:
            logger.warning("Could not download split list: %s", name)
    return split_files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download and organize the UCF-Crime dataset",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download split lists and create directory structure
  uv run scripts/download_ucf_crime.py --output data/ucf_crime

  # Organize already-downloaded videos
  uv run scripts/download_ucf_crime.py --output data/ucf_crime --raw-dir /path/to/raw/videos

  # Download from Google Drive (requires gdown)
  uv run scripts/download_ucf_crime.py --output data/ucf_crime --use-gdown

Notes:
  UCF-Crime is a large dataset (~128GB). The recommended approach is:
  1. Run this script to download split lists and create directory structure
  2. Manually download the video archives from https://www.crcv.ucf.edu/projects/real-world/
  3. Extract them and re-run with --raw-dir pointing to extracted videos
        """,
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/ucf_crime"),
        help="Output directory (default: data/ucf_crime)",
    )
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=None,
        help="Directory containing raw downloaded video files to organize",
    )
    parser.add_argument(
        "--use-gdown",
        action="store_true",
        help="Attempt Google Drive download via gdown",
    )
    parser.add_argument(
        "--splits-only",
        action="store_true",
        help="Only download split lists and create directory structure",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    output_dir = args.output.resolve()
    logger.info("Output directory: %s", output_dir)

    # Step 1: Create directory structure
    logger.info("Creating directory structure...")
    create_directory_structure(output_dir)

    # Step 2: Download split lists
    logger.info("Downloading train/test split lists...")
    split_files = download_split_lists(output_dir)

    if args.splits_only:
        logger.info("Split lists downloaded. Directory structure created.")
        logger.info("Download videos from: https://www.crcv.ucf.edu/projects/real-world/")
        logger.info("Then re-run with --raw-dir pointing to the extracted videos.")
        return

    # Step 3: Organize videos if raw dir provided
    if args.raw_dir:
        raw_dir = args.raw_dir.resolve()
        if not raw_dir.exists():
            logger.error("Raw directory does not exist: %s", raw_dir)
            sys.exit(1)
        logger.info("Organizing videos from %s...", raw_dir)

        train_split = split_files.get("train")
        test_split = split_files.get("test")
        organize_split = {}
        if train_split:
            organize_split["train"] = train_split
        if test_split:
            organize_split["test"] = test_split

        if organize_split:
            organize_videos(raw_dir, output_dir, organize_split)
        else:
            # Fallback: organize by filename pattern
            logger.info("No split files available; organizing by filename pattern...")
            all_videos = list(raw_dir.rglob("*.mp4")) + list(raw_dir.rglob("*.avi"))
            logger.info("Found %d video files", len(all_videos))
            for vpath in all_videos:
                atype = infer_anomaly_type(vpath.name)
                # Default to train; actual split should come from split files
                dest_dir = output_dir / "train" / atype
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / vpath.name
                if not dest.exists():
                    shutil.copy2(vpath, dest)

    # Summary
    for split in ["train", "test"]:
        split_dir = output_dir / split
        if split_dir.exists():
            count = sum(1 for _ in split_dir.rglob("*.mp4"))
            count += sum(1 for _ in split_dir.rglob("*.avi"))
            logger.info("%s split: %d videos", split, count)

    logger.info("Done. Dataset at: %s", output_dir)


if __name__ == "__main__":
    main()
