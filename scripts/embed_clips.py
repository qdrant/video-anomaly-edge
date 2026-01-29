#!/usr/bin/env python3
"""Batch-embed UCF-Crime clips using VideoMAE V2 (cloud) or MobileNet (edge).

Reads clips from the manifest, extracts embeddings, and saves them as .npz
files for downstream indexing.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model loaders
# ---------------------------------------------------------------------------

def load_cloud_model():
    """Load VideoMAE V2 model for 768-dim embeddings."""
    from transformers import VideoMAEForVideoClassification, VideoMAEImageProcessor

    model_name = os.getenv("VIDEOMAE_MODEL", "MCG-NJU/videomae-base-finetuned-kinetics")
    logger.info("Loading VideoMAE model: %s", model_name)
    processor = VideoMAEImageProcessor.from_pretrained(model_name)
    model = VideoMAEForVideoClassification.from_pretrained(model_name)
    model.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    logger.info("VideoMAE loaded on %s", device)
    return model, processor, device, 768


def load_edge_model():
    """Load MobileNetV3-Small for lightweight embeddings."""
    import torchvision.models as models
    import torchvision.transforms as T

    logger.info("Loading MobileNetV3-Small (edge)")
    base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    base.classifier = torch.nn.Identity()
    base.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    base = base.to(device)

    transform = T.Compose([
        T.ToPILImage(),
        T.Resize(256),
        T.CenterCrop(224),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    logger.info("MobileNetV3-Small loaded on %s (dim=576)", device)
    return base, transform, device, 576


# ---------------------------------------------------------------------------
# Frame extraction
# ---------------------------------------------------------------------------

def extract_frames(clip_path: str, num_frames: int = 16) -> list[np.ndarray]:
    """Extract uniformly-sampled frames from a video clip."""
    try:
        from decord import VideoReader, cpu
        vr = VideoReader(clip_path, ctx=cpu(0))
        total = len(vr)
        if total == 0:
            return []
        indices = np.linspace(0, total - 1, num_frames, dtype=int)
        frames = vr.get_batch(indices).asnumpy()  # (N, H, W, 3) RGB
        return [frames[i] for i in range(len(frames))]
    except Exception as e:
        logger.debug("decord failed for %s: %s; trying opencv", clip_path, e)

    try:
        import cv2
        cap = cv2.VideoCapture(clip_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total <= 0:
            cap.release()
            return []
        indices = np.linspace(0, total - 1, num_frames, dtype=int)
        frames = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret:
                frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        cap.release()
        return frames
    except Exception as e:
        logger.warning("Could not extract frames from %s: %s", clip_path, e)
        return []


# ---------------------------------------------------------------------------
# Embedding functions
# ---------------------------------------------------------------------------

@torch.no_grad()
def embed_cloud(
    clip_path: str,
    model,
    processor,
    device: torch.device,
) -> np.ndarray | None:
    """Embed a clip using VideoMAE V2. Returns 768-dim vector or None."""
    frames = extract_frames(clip_path, num_frames=16)
    if not frames:
        return None

    inputs = processor(list(frames), return_tensors="pt")
    pixel_values = inputs["pixel_values"].to(device)

    outputs = model(pixel_values, output_hidden_states=True)
    # Use CLS token from last hidden state
    hidden = outputs.hidden_states[-1]  # (1, seq_len, 768)
    embedding = hidden[:, 0, :].squeeze(0).cpu().numpy().astype(np.float32)

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding /= norm
    return embedding


@torch.no_grad()
def embed_edge(
    clip_path: str,
    model,
    transform,
    device: torch.device,
) -> np.ndarray | None:
    """Embed a clip using MobileNetV3. Returns 576-dim vector or None."""
    frames = extract_frames(clip_path, num_frames=8)
    if not frames:
        return None

    tensors = [transform(f) for f in frames]
    batch = torch.stack(tensors).to(device)
    features = model(batch)  # (T, 576)
    embedding = features.mean(dim=0).cpu().numpy().astype(np.float32)

    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding /= norm
    return embedding


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch-embed UCF-Crime clips",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data/ucf_crime"),
        help="UCF-Crime data directory",
    )
    parser.add_argument(
        "--model",
        choices=["cloud", "edge"],
        default="cloud",
        help="Model to use: cloud (VideoMAE, 768-dim) or edge (MobileNet, 576-dim)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1,
        help="Batch size (currently processes one clip at a time)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip clips that already have embeddings",
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
    if not manifest_path.exists():
        logger.error("Manifest not found at %s. Run segment_videos.py first.", manifest_path)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    clips = manifest["clips"]
    logger.info("Loaded manifest: %d clips", len(clips))

    output_file = data_dir / f"embeddings_{args.model}.npz"
    meta_file = data_dir / f"embeddings_{args.model}_meta.json"

    # Resume support: load existing embeddings
    existing_ids: set[str] = set()
    existing_embeddings: list[np.ndarray] = []
    existing_meta: list[dict] = []

    if args.resume and output_file.exists() and meta_file.exists():
        loaded = np.load(output_file)
        existing_embeddings = list(loaded["embeddings"])
        existing_meta = json.loads(meta_file.read_text())
        existing_ids = {m["clip_id"] for m in existing_meta}
        logger.info("Resuming: %d existing embeddings", len(existing_ids))

    # Load model
    if args.model == "cloud":
        model, processor, device, dim = load_cloud_model()
    else:
        model, transform, device, dim = load_edge_model()

    embeddings = list(existing_embeddings)
    meta = list(existing_meta)
    failed = 0
    t_start = time.time()

    for i, clip in enumerate(clips):
        clip_id = clip["clip_id"]
        if clip_id in existing_ids:
            continue

        clip_path = clip["clip_path"]
        if not Path(clip_path).exists():
            logger.debug("Clip not found: %s", clip_path)
            failed += 1
            continue

        if args.model == "cloud":
            emb = embed_cloud(clip_path, model, processor, device)
        else:
            emb = embed_edge(clip_path, model, transform, device)

        if emb is None:
            failed += 1
            continue

        embeddings.append(emb)
        meta.append({
            "clip_id": clip_id,
            "source_video": clip["source_video"],
            "anomaly_type": clip["anomaly_type"],
            "is_training": clip["is_training"],
            "start_time": clip["start_time"],
        })

        processed = len(embeddings) - len(existing_embeddings)
        if processed % 100 == 0:
            elapsed = time.time() - t_start
            rate = processed / elapsed if elapsed > 0 else 0
            logger.info(
                "Progress: %d/%d embedded (%.1f clips/s, %d failed)",
                len(embeddings), len(clips), rate, failed,
            )

    # Save
    if embeddings:
        emb_array = np.stack(embeddings)
        np.savez_compressed(output_file, embeddings=emb_array)
        meta_file.write_text(json.dumps(meta, indent=2))
        logger.info(
            "Saved %d embeddings (dim=%d) to %s",
            len(embeddings), emb_array.shape[1], output_file,
        )
    else:
        logger.warning("No embeddings produced.")

    elapsed = time.time() - t_start
    logger.info("Done in %.1fs. %d succeeded, %d failed.", elapsed, len(embeddings), failed)


if __name__ == "__main__":
    main()
