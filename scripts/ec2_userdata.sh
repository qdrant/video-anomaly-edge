#!/bin/bash
set -euxo pipefail
exec > /var/log/video-anomaly-setup.log 2>&1

echo "=== Video Anomaly Detection EC2 Setup ==="
export DEBIAN_FRONTEND=noninteractive

# --- System deps ---
apt-get update -qq
apt-get install -y -qq ffmpeg git curl unzip docker.io nodejs npm

# Start Docker and Qdrant
systemctl enable docker
systemctl start docker
docker run -d --name qdrant --restart=always -p 6333:6333 -p 6334:6334 qdrant/qdrant:latest

# --- Install pnpm ---
npm install -g pnpm@latest

# --- Install uv ---
curl -LsSf https://astral.sh/uv/install.sh | su - ubuntu -c 'sh'

# --- Setup as ubuntu user ---
su - ubuntu << 'USEREOF'
set -euxo pipefail
export PATH="$HOME/.local/bin:$PATH"

cd /home/ubuntu

# Clone/create project dir
mkdir -p video-anomaly
cd video-anomaly

# Wait for project files to be uploaded via scp
# (The launch script will scp after instance is ready)
echo "EC2 instance ready for project upload" > /home/ubuntu/READY

USEREOF

echo "=== EC2 base setup complete ==="
