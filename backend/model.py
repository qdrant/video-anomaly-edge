"""VideoMAE V2 embedding extraction for video anomaly detection."""

import numpy as np
import torch
from pathlib import Path


_model = None
_processor = None
_device = None


def load_model(device: str = "cuda", model_name: str = "MCG-NJU/videomae-base"):
    """Load VideoMAE V2 model and processor."""
    from transformers import VideoMAEModel, VideoMAEImageProcessor

    global _model, _processor, _device
    _device = torch.device(device if torch.cuda.is_available() else "cpu")
    _processor = VideoMAEImageProcessor.from_pretrained(model_name)
    _model = VideoMAEModel.from_pretrained(model_name).to(_device).eval()
    return _model, _processor


def get_model():
    """Get loaded model, loading if needed."""
    if _model is None:
        load_model()
    return _model, _processor, _device


def _load_video_frames(video_path: str, num_frames: int = 16) -> np.ndarray:
    """Load video and sample frames uniformly using PyAV."""
    import av

    container = av.open(str(video_path))
    stream = container.streams.video[0]

    # Decode all frames
    all_frames = []
    for frame in container.decode(stream):
        all_frames.append(frame.to_ndarray(format="rgb24"))
    container.close()

    total = len(all_frames)
    if total == 0:
        raise ValueError(f"No frames found in {video_path}")

    indices = np.linspace(0, total - 1, num_frames, dtype=int)
    frames = np.stack([all_frames[i] for i in indices])  # (num_frames, H, W, C)
    return frames


def extract_embedding(video_path: str, model=None, processor=None, device=None) -> np.ndarray:
    """Extract CLS token embedding from a video clip.

    Returns:
        768-dimensional numpy array (VideoMAE base hidden size).
    """
    if model is None:
        model, processor, device = get_model()

    frames = _load_video_frames(video_path)
    inputs = processor(list(frames), return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    cls_embedding = outputs.last_hidden_state[:, 0, :].squeeze().cpu().numpy()
    return cls_embedding


def batch_extract(
    video_paths: list[str],
    model=None,
    processor=None,
    device=None,
    batch_size: int = 4,
) -> list[np.ndarray]:
    """Extract embeddings for multiple video clips with true batched inference."""
    if model is None:
        model, processor, device = get_model()

    embeddings = []
    for i in range(0, len(video_paths), batch_size):
        batch_paths = video_paths[i : i + batch_size]
        # Load all frames for the batch
        batch_frames = [list(_load_video_frames(p)) for p in batch_paths]
        # Process as a batch through the processor
        inputs = processor(batch_frames, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**inputs)
        # Extract CLS tokens for each item in the batch
        cls_tokens = outputs.last_hidden_state[:, 0, :].cpu().numpy()
        for j in range(cls_tokens.shape[0]):
            embeddings.append(cls_tokens[j])
    return embeddings
