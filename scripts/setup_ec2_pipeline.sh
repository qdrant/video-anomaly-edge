#!/usr/bin/env bash
# Setup script to run on EC2 GPU instance (g5.xlarge)
# Downloads UCF-Crime dataset from HuggingFace and runs the full pipeline
set -euo pipefail

echo "=== Video Anomaly Detection - EC2 Pipeline Setup ==="
echo "Instance: $(curl -s http://169.254.169.254/latest/meta-data/instance-type 2>/dev/null || echo 'unknown')"
echo "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'none detected')"

# --- System deps ---
echo -e "\n[1/8] Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq ffmpeg git curl unzip python3-pip

# --- UV ---
echo -e "\n[2/8] Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# --- Clone project ---
echo -e "\n[3/8] Setting up project..."
cd /home/ubuntu
if [ ! -d "video-anomaly" ]; then
    git clone https://github.com/$GITHUB_USER/video-anomaly.git || {
        echo "No git remote, copying from local..."
        mkdir -p video-anomaly
    }
fi
cd video-anomaly

# --- Python deps ---
echo -e "\n[4/8] Installing Python dependencies..."
uv python install 3.12
uv sync

# --- Download UCF-Crime from HuggingFace ---
echo -e "\n[5/8] Downloading UCF-Crime dataset from HuggingFace..."
uv run python -c "
from huggingface_hub import hf_hub_download
import os

repo = 'jinmang2/ucf_crime'
files = [
    'Training-Normal-Videos-Part-1.zip',
    'Training-Normal-Videos-Part-2.zip',
    'Anomaly-Videos-Part-1.zip',
    'Anomaly-Videos-Part-2.zip',
    'Anomaly-Videos-Part-3.zip',
    'Anomaly-Videos-Part-4.zip',
    'Testing_Normal_Videos.zip',
    'test.zip',
]

os.makedirs('data/ucf_crime/raw', exist_ok=True)
for f in files:
    print(f'Downloading {f}...')
    path = hf_hub_download(repo, f, repo_type='dataset', local_dir='data/ucf_crime/raw')
    print(f'  -> {path} ({os.path.getsize(path)/1024/1024:.0f} MB)')
print('All downloads complete.')
"

# --- Extract ---
echo -e "\n[6/8] Extracting videos..."
cd data/ucf_crime
for z in raw/*.zip; do
    echo "Extracting $z..."
    unzip -q -o "$z" -d raw/
done

# Create directory structure and organize
cd /home/ubuntu/video-anomaly
uv run python scripts/download_ucf_crime.py --output data/ucf_crime --raw-dir data/ucf_crime/raw

# --- Segment into clips ---
echo -e "\n[7/8] Segmenting videos into 10s clips..."
uv run python scripts/segment_videos.py \
    --input-dir data/ucf_crime \
    --output-dir data/ucf_crime/clips \
    --clip-duration 10 \
    --workers 4

# --- Embed clips with VideoMAE (GPU) ---
echo -e "\n[8/8] Extracting VideoMAE embeddings (GPU)..."
uv run python scripts/embed_clips.py \
    --manifest data/ucf_crime/clips/clip_manifest.json \
    --model cloud \
    --batch-size 8 \
    --output data/ucf_crime/embeddings \
    --resume

echo -e "\n=== Pipeline complete ==="
echo "Embeddings saved to: data/ucf_crime/embeddings/"
echo "Next steps:"
echo "  1. Start Qdrant:  docker run -d -p 6333:6333 qdrant/qdrant"
echo "  2. Index:          uv run python scripts/index_qdrant.py --mode cloud"
echo "  3. Evaluate:       uv run python scripts/evaluate.py"
echo "  4. Start backend:  uv run uvicorn backend.main:app --host 0.0.0.0 --port 9876"
echo "  5. Start frontend: cd frontend && pnpm install && pnpm dev"
