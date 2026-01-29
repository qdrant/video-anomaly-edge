#!/usr/bin/env python3
"""Parallel embedding of UCF-Crime clips using multiple worker processes.

Shards the clip manifest across N workers, each loading its own model copy.
Results are saved per-shard then merged at the end.

Usage:
    uv run python scripts/embed_parallel.py --data-dir data/ucf_crime --workers 4
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from multiprocessing import Process, Queue
from pathlib import Path

import numpy as np
import torch
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def extract_frames(clip_path: str, num_frames: int = 16) -> list[np.ndarray]:
    try:
        from decord import VideoReader, cpu
        vr = VideoReader(clip_path, ctx=cpu(0))
        total = len(vr)
        if total == 0:
            return []
        indices = np.linspace(0, total - 1, num_frames, dtype=int)
        frames = vr.get_batch(indices).asnumpy()
        return [frames[i] for i in range(len(frames))]
    except Exception:
        pass

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
    except Exception:
        return []


def worker_fn(worker_id: int, shard: list[dict], model_type: str, output_path: str, progress_queue: Queue):
    """Each worker loads its own model and processes its shard of clips."""
    torch.set_num_threads(2)  # limit per-worker threads so they don't fight

    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [W{worker_id}] %(message)s",
    )
    log = logging.getLogger(f"worker-{worker_id}")

    # Load model
    if model_type == "cloud":
        from transformers import VideoMAEForVideoClassification, VideoMAEImageProcessor
        model_name = os.getenv("VIDEOMAE_MODEL", "MCG-NJU/videomae-base-finetuned-kinetics")
        processor = VideoMAEImageProcessor.from_pretrained(model_name)
        model = VideoMAEForVideoClassification.from_pretrained(model_name)
        model.eval()
        device = torch.device("cpu")
        model = model.to(device)
        dim = 768
    else:
        import torchvision.models as models
        import torchvision.transforms as T
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        base.classifier = torch.nn.Identity()
        base.eval()
        device = torch.device("cpu")
        base = base.to(device)
        transform = T.Compose([
            T.ToPILImage(), T.Resize(256), T.CenterCrop(224), T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        dim = 576

    log.info("Model loaded. Processing %d clips...", len(shard))

    embeddings = []
    meta = []
    failed = 0
    t0 = time.time()

    for i, clip in enumerate(shard):
        clip_path = clip["clip_path"]
        if not Path(clip_path).exists():
            failed += 1
            continue

        try:
            with torch.no_grad():
                if model_type == "cloud":
                    frames = extract_frames(clip_path, num_frames=16)
                    if not frames:
                        failed += 1
                        continue
                    inputs = processor(list(frames), return_tensors="pt")
                    pixel_values = inputs["pixel_values"].to(device)
                    outputs = model(pixel_values, output_hidden_states=True)
                    hidden = outputs.hidden_states[-1]
                    emb = hidden[:, 0, :].squeeze(0).cpu().numpy().astype(np.float32)
                else:
                    frames = extract_frames(clip_path, num_frames=8)
                    if not frames:
                        failed += 1
                        continue
                    tensors = [transform(f) for f in frames]
                    batch = torch.stack(tensors).to(device)
                    features = base(batch)
                    emb = features.mean(dim=0).cpu().numpy().astype(np.float32)

                norm = np.linalg.norm(emb)
                if norm > 0:
                    emb /= norm

                embeddings.append(emb)
                meta.append({
                    "clip_id": clip["clip_id"],
                    "source_video": clip["source_video"],
                    "anomaly_type": clip["anomaly_type"],
                    "is_training": clip["is_training"],
                    "start_time": clip["start_time"],
                })
        except Exception as e:
            log.warning("Failed %s: %s", clip_path, e)
            failed += 1

        if (i + 1) % 50 == 0:
            elapsed = time.time() - t0
            rate = (i + 1 - failed) / elapsed if elapsed > 0 else 0
            progress_queue.put((worker_id, i + 1, len(shard), rate, failed))
            log.info("Progress: %d/%d (%.1f clips/s, %d failed)", i + 1, len(shard), rate, failed)

    # Save shard results
    if embeddings:
        emb_array = np.stack(embeddings)
        np.savez_compressed(output_path, embeddings=emb_array)
        meta_path = output_path.replace(".npz", "_meta.json")
        Path(meta_path).write_text(json.dumps(meta, indent=2))
        log.info("Saved %d embeddings to %s", len(embeddings), output_path)

    elapsed = time.time() - t0
    progress_queue.put((worker_id, len(shard), len(shard), len(embeddings) / elapsed if elapsed > 0 else 0, failed))
    log.info("Done: %d succeeded, %d failed in %.1fs", len(embeddings), failed, elapsed)


def main():
    parser = argparse.ArgumentParser(description="Parallel clip embedding")
    parser.add_argument("--data-dir", type=Path, default=Path("data/ucf_crime"))
    parser.add_argument("--model", choices=["cloud", "edge"], default="cloud")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [MAIN] %(message)s")

    data_dir = args.data_dir.resolve()
    manifest_path = data_dir / "clip_manifest.json"
    if not manifest_path.exists():
        logger.error("Manifest not found: %s", manifest_path)
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    clips = manifest["clips"]
    logger.info("Loaded %d clips", len(clips))

    # Resume: skip already embedded clips
    output_file = data_dir / f"embeddings_{args.model}.npz"
    meta_file = data_dir / f"embeddings_{args.model}_meta.json"
    existing_ids: set[str] = set()

    if args.resume and output_file.exists() and meta_file.exists():
        existing_meta = json.loads(meta_file.read_text())
        existing_ids = {m["clip_id"] for m in existing_meta}
        logger.info("Resuming: skipping %d already embedded clips", len(existing_ids))

    # Also check shard files
    for i in range(args.workers):
        shard_meta = data_dir / f"embeddings_{args.model}_shard{i}_meta.json"
        if shard_meta.exists():
            sm = json.loads(shard_meta.read_text())
            existing_ids.update(m["clip_id"] for m in sm)
            logger.info("Found shard %d with %d existing embeddings", i, len(sm))

    remaining = [c for c in clips if c["clip_id"] not in existing_ids]
    logger.info("Remaining: %d clips to embed", len(remaining))

    if not remaining:
        logger.info("All clips already embedded. Merging shards...")
        merge_shards(data_dir, args.model, args.workers)
        return

    # Shard across workers
    shards = [[] for _ in range(args.workers)]
    for i, clip in enumerate(remaining):
        shards[i % args.workers].append(clip)

    progress_queue: Queue = Queue()
    processes = []
    t_start = time.time()

    for i in range(args.workers):
        shard_path = str(data_dir / f"embeddings_{args.model}_shard{i}.npz")
        p = Process(target=worker_fn, args=(i, shards[i], args.model, shard_path, progress_queue))
        p.start()
        processes.append(p)
        logger.info("Started worker %d with %d clips", i, len(shards[i]))

    # Monitor progress
    while any(p.is_alive() for p in processes):
        while not progress_queue.empty():
            wid, done, total, rate, failed = progress_queue.get_nowait()
            logger.info("Worker %d: %d/%d (%.1f clips/s, %d failed)", wid, done, total, rate, failed)
        time.sleep(10)

    for p in processes:
        p.join()

    elapsed = time.time() - t_start
    logger.info("All workers done in %.1fs", elapsed)

    # Merge shards
    merge_shards(data_dir, args.model, args.workers)


def merge_shards(data_dir: Path, model_type: str, num_workers: int):
    """Merge per-worker shard files into a single output."""
    all_embeddings = []
    all_meta = []

    # Include any existing main file
    main_file = data_dir / f"embeddings_{model_type}.npz"
    main_meta = data_dir / f"embeddings_{model_type}_meta.json"
    if main_file.exists() and main_meta.exists():
        loaded = np.load(main_file)
        all_embeddings.extend(loaded["embeddings"])
        all_meta.extend(json.loads(main_meta.read_text()))

    for i in range(num_workers):
        shard_file = data_dir / f"embeddings_{model_type}_shard{i}.npz"
        shard_meta = data_dir / f"embeddings_{model_type}_shard{i}_meta.json"
        if shard_file.exists() and shard_meta.exists():
            loaded = np.load(shard_file)
            all_embeddings.extend(loaded["embeddings"])
            all_meta.extend(json.loads(shard_meta.read_text()))
            logger.info("Merged shard %d: %d embeddings", i, len(loaded["embeddings"]))

    if all_embeddings:
        emb_array = np.stack(all_embeddings)
        np.savez_compressed(str(main_file), embeddings=emb_array)
        main_meta.write_text(json.dumps(all_meta, indent=2))
        logger.info("Final: %d embeddings (dim=%d) saved to %s", len(all_meta), emb_array.shape[1], main_file)

        # Clean up shards
        for i in range(num_workers):
            for ext in [".npz", "_meta.json"]:
                p = data_dir / f"embeddings_{model_type}_shard{i}{ext}"
                p.unlink(missing_ok=True)
    else:
        logger.warning("No embeddings to merge.")


if __name__ == "__main__":
    main()
