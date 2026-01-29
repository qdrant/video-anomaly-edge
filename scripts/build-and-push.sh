#!/bin/bash
set -euo pipefail

AWS_REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

declare -A DOCKERFILES=(
  ["model-server"]="Dockerfile.model"
  ["backend"]="Dockerfile.backend"
  ["frontend"]="Dockerfile.frontend"
)

for svc in "${!DOCKERFILES[@]}"; do
  echo "Building ${svc}..."
  docker build -f "${DOCKERFILES[$svc]}" -t "${ECR_REGISTRY}/${svc}:latest" .
  echo "Pushing ${svc}..."
  docker push "${ECR_REGISTRY}/${svc}:latest"
done

echo "Done. All images pushed to ${ECR_REGISTRY}"
