# Instance Context - mgr_1_296644
Generated: 2026-01-27T10:54:56.644Z

## 🗺️ YOUR LOCATION & IDENTITY
- **Instance ID**: mgr_1_296644
- **Role**: manager
- **Working Directory**: /Users/thierrydamiba/video-anomaly
- **Parent Directory**: /Users/thierrydamiba
- **Parent Instance**: Primary Claude

## 🚀 QUICK START COMMANDS
```bash
# Where am I?
pwd

# What files do I have?
ls -la

# What's in parent directory?
ls -la ..
```

## YOUR MANAGER RESPONSIBILITIES
1. Understand your assigned domain
2. Plan implementation approach
3. Either implement directly OR spawn specialists (check with Executive)
4. Coordinate work and integration
5. Report functional completion

## 📋 MCP BRIDGE COMMANDS (Copy & Paste Ready)

### List All Instances
```bash
node ../scripts/mcp_bridge.js list '{}'
```

### IF SPAWNING SPECIALISTS:

#### Spawn Specialist (MODIFY THEN RUN)
```bash
node ../scripts/mcp_bridge.js spawn '{"role":"specialist","workDir":"/Users/thierrydamiba/video-anomaly","context":"[SPECIALIST TASK]","parentId":"mgr_1_296644"}'
```

#### Send Message to Specialist (MODIFY THEN RUN)
```bash
node ../scripts/mcp_bridge.js send '{"instanceId":"[SPECIALIST_ID]","text":"[MESSAGE]"}'
```

#### Read Specialist Output (MODIFY THEN RUN)
```bash
node ../scripts/mcp_bridge.js read '{"instanceId":"[SPECIALIST_ID]","lines":50}'
```

## IMPLEMENTATION REMINDERS
- Check if you should implement directly or spawn specialists
- All work goes in: /Users/thierrydamiba/video-anomaly
- Coordinate with other managers through Executive
- Test functionality before reporting completion

## 📋 PROJECT-SPECIFIC CONTEXT
# Video Anomaly Detection - Docker & Deployment Manager

## Project Goal
Create Docker containers and deployment configs for a video anomaly detection system on AWS.

## System Components
1. **Model Server** - GPU-enabled container running an open-source video model (InternVideo2 or VideoMAE V2) for embedding extraction
2. **Backend API** - FastAPI server for anomaly scoring, incident formation
3. **Qdrant** - Vector database (use official qdrant/qdrant image)
4. **Frontend** - Next.js operator console

## Your Task: Dockerization & Compose
1. Create Dockerfiles:
   - `Dockerfile.model` - CUDA-enabled Python container for video model inference (base: nvidia/cuda:12.1-runtime or pytorch/pytorch)
   - `Dockerfile.backend` - FastAPI backend
   - `Dockerfile.frontend` - Next.js frontend
   
2. Create `docker-compose.yml` for local development:
   - model-server (GPU, port 9877)
   - backend (port 9876, depends on model-server + qdrant)
   - qdrant (port 6333/6334)
   - frontend (port 4321)
   - Shared network
   - Volume mounts for video data and model weights

3. Create `docker-compose.prod.yml` for AWS deployment (ECR image refs)

4. Create deployment scripts:
   - `scripts/build-and-push.sh` - Build & push to ECR
   - `scripts/deploy.sh` - Deploy to ECS/EC2

5. Use .env files for all secrets - NEVER hardcode credentials
6. Use memorable odd port numbers
7. Use uv for Python deps, pnpm for frontend
