# Video Anomaly Detection: Edge to Cloud

Real-time video anomaly detection from edge to cloud using [Qdrant Edge](https://qdrant.tech/documentation/edge/), [Twelve Labs Marengo 3.0](https://twelvelabs.io), [NVIDIA Metropolis VSS](https://developer.nvidia.com/metropolis), and [Vultr Cloud GPUs](https://www.vultr.com/products/cloud-gpu/).

Instead of classifying anomalies, the system treats detection as a nearest-neighbor search problem: index embeddings of normal activity as a baseline, then flag clips that are far from that baseline. No anomaly labels required. No retraining when new anomaly types emerge.

**Benchmarked on the UCF Crime Dataset:** 94% recall, 0.97 AUC-ROC, ~10% of clips escalated to cloud.

- [Live Demo](https://qdrant-edge-video-anomaly.vercel.app/)
- [3-Part Tutorial](https://qdrant.tech/documentation/tutorials-build-essentials/video-anomaly-edge-part-1/)
- [Blog Post](https://qdrant.tech/blog/video-anomaly-detection-edge-to-cloud/)

## Architecture

```
Camera (NVIDIA Jetson)
    |
    v
Qdrant Edge (on-device)
    - Immutable HNSW shard: cloud-synced baseline of normal clips
    - Mutable shard: live writes
    - kNN lookup: sub-millisecond anomaly scoring
    |
    | (flagged clips only, ~10% of total)
    v
Cloud (Vultr GPU)
    - Twelve Labs Marengo 3.0: high-fidelity video embeddings
    - NVIDIA VSS: VLM captioning, audio transcription, CV pipeline
    - Ensemble scoring: edge + cloud scores combined
    - Incident reports with natural-language explanations
```

## Stack

| Component | Role |
| :--- | :--- |
| [Qdrant Edge](https://qdrant.tech/documentation/edge/) | On-device vector search, two-shard kNN triage |
| [Twelve Labs Marengo 3.0](https://twelvelabs.io) | Video embeddings, semantic search, Q&A |
| [NVIDIA Metropolis VSS](https://developer.nvidia.com/metropolis) | GPU-accelerated video ingestion and captioning |
| [Vultr Cloud GPUs](https://www.vultr.com/products/cloud-gpu/) | Cloud tier infrastructure |
| VideoMAE | Lightweight edge embedding model |

## Services

- `model-server`: VideoMAE embedding server (GPU, port 9877)
- `backend`: FastAPI anomaly detection API (port 9876)
- `edge`: Qdrant Edge detector (NVIDIA Jetson)
- `frontend`: Next.js dashboard with live camera grid and incident view

## Quickstart

```bash
git clone https://github.com/qdrant/video-anomaly-edge
cd video-anomaly-edge

cp .env.example .env
# Fill in QDRANT_API_KEY, TWELVE_LABS_API_KEY

docker compose up
```

The dashboard runs at `http://localhost:3000`.

## Build a Baseline

```bash
# Download UCF Crime dataset clips
uv run python scripts/download_ucf_crime.py

# Segment into ~30s clips
uv run python scripts/segment_videos.py

# Embed and index into Qdrant
uv run python scripts/embed_clips.py
uv run python scripts/index_qdrant.py
```

## Evaluate

```bash
uv run python scripts/evaluate.py
```

Reports recall, precision, AUC-ROC, and cloud escalation rate.

## Deploy to Vultr

See `deploy/` for Terraform configs and a cloud-init script for Vultr GPU instances.

```bash
cd deploy/terraform
terraform init && terraform apply
```

## VSS Integration

To enable NVIDIA Metropolis VSS for cloud-tier analysis:

```bash
docker compose -f docker-compose.vss.yml up
```

Set `VSS_ENABLED=true` in `.env`. Requires NVIDIA GPU and NGC access.

See [qdrant/twelvelabs-nvidia-vss](https://github.com/qdrant/twelvelabs-nvidia-vss) for the standalone VSS + Twelve Labs integration.

## Credits

Built on original work by [Nathan Chess](https://github.com/nathanchess) ([nathanchess/twelvelabs-nvidia-vss-sample](https://github.com/nathanchess/twelvelabs-nvidia-vss-sample)) and [James Le](https://github.com/james-le-twelve-labs) ([james-le-twelve-labs/nvidia-vss](https://github.com/james-le-twelve-labs/nvidia-vss)).

## Hosting the frontend without the local `data/` folder

The dashboard reads feeds, runs and incidents from `frontend/public/data/**.json`, streams clips and
thumbnails from `../data/<dataset>/{clips,thumbnails}/testing/`, and searches a Qdrant collection of
Twelve Labs clip embeddings. On a host without that folder (Vercel), every camera tile is black and
search is empty. To deploy it anywhere:

1. **Clips.** Encode the ShanghaiTech test videos to `data/shanghaitech/clips/testing/<id>.mp4` plus
   thumbnails (`scripts/frontend-data/build_clips.sh <frames_root> <feeds_dir> <data_root>`), then split
   each into the 10-second sub-clips the master feed references:
   `ffmpeg -i <id>.mp4 -c copy -f segment -segment_time 10 -reset_timestamps 1 test_<id>_%03d.mp4`.
2. **Static host.** Upload `clips/` and `thumbnails/` to a public bucket (Vercel Blob example:
   `scripts/frontend-data/upload_blob.mjs`, needs `@vercel/blob`) and set `CLIP_BASE_URL` to its base URL.
   The clip and thumbnail routes redirect there instead of reading disk.
3. **Collection.** `scripts/frontend-data/embed_clips_twelvelabs.py` embeds each clip with Marengo and
   indexes it as named vector `v_clip` with the payload the search route expects;
   `scripts/frontend-data/set_offsets.py` sets each clip's offset into `shanghaitech_master.json` so the
   search preview seeks to the right place. Point `QDRANT_URL` / `COLLECTION_NAME` at it.
4. **Env.** Copy `frontend/.env.example`. `TWELVE_LABS_EMBED_MODEL` must match the model used in step 3.

Only datasets whose data is deployed should be `available: true` in `frontend/src/app/api/datasets/route.ts`;
the pages iterate the available list.
