#!/bin/bash
set -euo pipefail

AWS_REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "Deployment complete. Services:"
docker compose -f docker-compose.prod.yml ps
