# Instance Context - mgr_1_281678
Generated: 2026-01-27T10:54:41.679Z

## 🗺️ YOUR LOCATION & IDENTITY
- **Instance ID**: mgr_1_281678
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
node ../scripts/mcp_bridge.js spawn '{"role":"specialist","workDir":"/Users/thierrydamiba/video-anomaly","context":"[SPECIALIST TASK]","parentId":"mgr_1_281678"}'
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
# Video Anomaly Detection - Model & Backend Manager

## Project Goal
Build the Python backend for a video anomaly detection system on AWS, replacing Twelve Labs Marengo with an open-source video model.

## Original System (from /Users/thierrydamiba/twelve/avenue/)
- Used Twelve Labs Marengo 3.0 for 512-dim video embeddings
- kNN anomaly scoring: score = 1 - mean(cosine_sim(clip_embedding, top_k_training_neighbors)), k=3
- Qdrant for vector search (cosine distance)
- Incident formation: EMA smoothing (α=0.3), hysteresis thresholds (start=0.045, end=0.025), min duration 10s, cooldown merge 20s
- FastAPI server on port 42069

## Your Task: Open-Source Model + Backend
1. Choose and integrate an open-source video embedding model. Best candidates:
   - **InternVideo2** - SOTA video understanding, good embeddings
   - **VideoMAE V2** - Self-supervised, good for anomaly detection
   - **LanguageBind** - Multimodal, good embeddings
   - **CLIP4Clip / VideoCLIP** - CLIP-based video models
   Recommend: InternVideo2 or VideoMAE V2 for best embedding quality

2. Create the backend structure:
   - `backend/model.py` - Model loading & inference (produce embeddings from video clips)
   - `backend/main.py` - FastAPI app
   - `backend/anomaly.py` - kNN scoring (same formula as original)
   - `backend/incidents.py` - Incident formation pipeline
   - `backend/models.py` - Pydantic schemas
   - `backend/streaming.py` - Real-time processing pipeline
   - `pyproject.toml` - Dependencies (use uv)

3. Create a model serving component (can be same process or separate):
   - Load model on GPU
   - Accept video clip → return embedding vector
   - Batch inference support

4. Use .env for all API keys/secrets. Port: 9876
5. Use uv for Python dependency management
6. Reference the original code at /Users/thierrydamiba/twelve/avenue/backend/ for architecture patterns
