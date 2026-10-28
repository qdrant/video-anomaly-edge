#!/usr/bin/env python3
"""Embed ShanghaiTech test clips with Twelve Labs Marengo and index them in Qdrant
in the shape the Sentinel frontend's /api/[dataset]/embeddings/search expects:
named vector `v_clip`, payload clip_id / source_video / feed_id / is_anomaly / severity /
thumbnail_url / label.

    python3 embed_clips_twelvelabs.py --clips data/shanghaitech/clips/testing \
        --feeds frontend/public/data/feeds/shanghaitech --collection shanghaitech_clips

Reads TWELVE_LABS_API_KEY from the environment (source ~/sentinel/.env first).
Idempotent: clips already present in the collection (by clip_id payload) are skipped.
"""
import argparse, glob, json, os, sys, time, uuid
from pathlib import Path

import requests
from qdrant_client import QdrantClient, models

API = os.environ.get("TWELVE_LABS_API_URL", "https://api.twelvelabs.io/v1.3")
MODEL = os.environ.get("TWELVE_LABS_EMBED_MODEL", "marengo3.0")
KEY = os.environ.get("TWELVE_LABS_API_KEY")


def embed_video(path: Path) -> list[float]:
    h = {"x-api-key": KEY}
    with open(path, "rb") as f:
        r = requests.post(f"{API}/embed/tasks", headers=h,
                          data=[("model_name", MODEL), ("video_embedding_scope", "clip"), ("video_embedding_scope", "video")],
                          files={"video_file": (path.name, f, "video/mp4")}, timeout=120)
    r.raise_for_status()
    task = r.json()["_id"]
    for _ in range(120):
        s = requests.get(f"{API}/embed/tasks/{task}/status", headers=h, timeout=30).json()
        if s.get("status") == "ready":
            break
        if s.get("status") == "failed":
            raise RuntimeError(f"embed task failed for {path.name}: {s}")
        time.sleep(5)
    else:
        raise TimeoutError(path.name)
    d = requests.get(f"{API}/embed/tasks/{task}", headers=h, timeout=30).json()
    segs = d["video_embedding"]["segments"]
    seg = next((x for x in segs if x.get("embedding_scope") == "video"), segs[0])
    return seg.get("float") or seg["embeddings_float"]  # marengo3.x uses "float", 2.7 "embeddings_float"


def feed_meta(feeds_dir: Path) -> dict[str, dict]:
    """clip_id -> {feed_id, label, severity, is_anomaly} from the per-feed JSON."""
    out = {}
    for fp in glob.glob(str(feeds_dir / "shanghaitech_scene_*.json")):
        d = json.load(open(fp))
        wins = {w["window_id"]: w for w in d.get("windows", [])}
        for s in d["segments"]:
            w = wins.get(s["segment_id"], {})
            out[s["segment_id"]] = {
                "feed_id": d["feed_id"], "label": d.get("label"),
                "severity": w.get("severity"), "is_anomaly": w.get("is_anomaly"),
            }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--feeds", required=True)
    ap.add_argument("--collection", default="shanghaitech_clips")
    ap.add_argument("--qdrant-url", default=os.environ.get("QDRANT_URL", "http://127.0.0.1:6333"))
    ap.add_argument("--limit", type=int, default=0, help="only the first N clips (smoke test)")
    a = ap.parse_args()
    if not KEY:
        sys.exit("TWELVE_LABS_API_KEY not set")

    q = QdrantClient(url=a.qdrant_url)
    meta = feed_meta(Path(a.feeds))
    clips = sorted(Path(a.clips).glob("*.mp4"))
    if a.limit:
        clips = clips[: a.limit]
    done = set()
    if q.collection_exists(a.collection):
        pts, _ = q.scroll(a.collection, limit=1000, with_payload=["clip_id"])
        done = {p.payload["clip_id"] for p in pts}
    print(f"{len(clips)} clips, {len(done)} already indexed", flush=True)

    for i, c in enumerate(clips, 1):
        cid = c.stem
        if cid in done:
            continue
        vec = embed_video(c)
        if not q.collection_exists(a.collection):
            q.create_collection(a.collection, vectors_config={
                "v_clip": models.VectorParams(size=len(vec), distance=models.Distance.COSINE)})
        m = meta.get(cid, {})
        q.upsert(a.collection, points=[models.PointStruct(
            id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"shanghaitech/{cid}")),
            vector={"v_clip": vec},
            payload={"clip_id": cid, "source_video": f"{cid}.mp4", "dataset_id": "shanghaitech",
                     "thumbnail_url": f"/api/shanghaitech/thumbnails/testing/{cid}.jpg",
                     "clip_index": 0, "start_time": 0, "end_time": 10, **m})])
        print(f"[{i}/{len(clips)}] {cid} dim={len(vec)}", flush=True)
    print("done", q.count(a.collection).count, "points")


if __name__ == "__main__":
    main()
