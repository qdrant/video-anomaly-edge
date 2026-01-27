# Instance Context - mgr_1_266438
Generated: 2026-01-27T10:54:26.438Z

## 🗺️ YOUR LOCATION & IDENTITY
- **Instance ID**: mgr_1_266438
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
node ../scripts/mcp_bridge.js spawn '{"role":"specialist","workDir":"/Users/thierrydamiba/video-anomaly","context":"[SPECIALIST TASK]","parentId":"mgr_1_266438"}'
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
# Video Anomaly Detection - AWS Infrastructure Manager

## Project Goal
Recreate the "Sentinel" video anomaly detection system on AWS using open-source video models instead of Twelve Labs Marengo.

## Original Architecture (from /Users/thierrydamiba/twelve/avenue/)
- Twelve Labs Marengo 3.0 for 512-dim video embeddings
- Qdrant Cloud for vector similarity search
- FastAPI backend (anomaly scoring via kNN: score = 1 - mean(cosine_sim(clip, top_k_neighbors)))
- Next.js frontend operator console
- Incident formation pipeline with temporal smoothing + hysteresis thresholding

## Your Task: AWS Infrastructure Setup
1. Design and create Terraform/CDK infrastructure for AWS deployment
2. Set up: EC2/ECS for model inference (GPU instance), Qdrant on EC2 or use OpenSearch, S3 for video storage, ECR for containers
3. Create proper networking (VPC, security groups, ALB)
4. Use .env files for all secrets - NEVER hardcode credentials
5. Use memorable odd port numbers (7777, 4321, 9876, etc.)

## Key Requirements
- GPU instance for open-source video model inference (g5.xlarge or similar)
- Self-hosted Qdrant on EC2 or ECS
- S3 bucket for video clips storage
- ECR repos for backend + model server containers
- IAM roles with least privilege
- Use uv for Python deps, pnpm for frontend
