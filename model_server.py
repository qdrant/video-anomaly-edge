"""Standalone FastAPI model server for VideoMAE V2 embedding extraction."""

import io
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel

model = None
processor = None
device = None


def load_videomae(device_str: str = "cuda"):
    from transformers import VideoMAEModel, VideoMAEImageProcessor

    global model, processor, device
    device = torch.device(device_str if torch.cuda.is_available() else "cpu")
    model_name = "MCG-NJU/videomae-base"
    processor = VideoMAEImageProcessor.from_pretrained(model_name)
    model = VideoMAEModel.from_pretrained(model_name).to(device).eval()
    return model, processor


def extract_embedding_from_path(video_path: str) -> np.ndarray:
    from decord import VideoReader, cpu

    vr = VideoReader(video_path, ctx=cpu(0))
    total = len(vr)
    indices = np.linspace(0, total - 1, 16, dtype=int)
    frames = vr.get_batch(indices).asnumpy()  # (16, H, W, C)

    inputs = processor(list(frames), return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model(**inputs)
    cls_embedding = outputs.last_hidden_state[:, 0, :].squeeze().cpu().numpy()
    return cls_embedding


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_videomae()
    yield


app = FastAPI(title="VideoMAE Model Server", lifespan=lifespan)


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dim: int
    latency_ms: float


class BatchEmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    count: int
    latency_ms: float


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "device": str(device),
    }


@app.post("/embed", response_model=EmbeddingResponse)
async def embed(file: UploadFile = File(...)):
    if not model:
        raise HTTPException(503, "Model not loaded")

    t0 = time.perf_counter()
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        emb = extract_embedding_from_path(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    latency = (time.perf_counter() - t0) * 1000
    return EmbeddingResponse(embedding=emb.tolist(), dim=len(emb), latency_ms=latency)


@app.post("/batch-embed", response_model=BatchEmbeddingResponse)
async def batch_embed(files: list[UploadFile] = File(...)):
    if not model:
        raise HTTPException(503, "Model not loaded")

    t0 = time.perf_counter()
    embeddings = []
    for f in files:
        content = await f.read()
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            emb = extract_embedding_from_path(tmp_path)
            embeddings.append(emb.tolist())
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    latency = (time.perf_counter() - t0) * 1000
    return BatchEmbeddingResponse(
        embeddings=embeddings, count=len(embeddings), latency_ms=latency
    )
