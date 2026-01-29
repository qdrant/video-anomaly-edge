"""Lightweight edge model for fast video frame embedding."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as T

from edge.config import EDGE_EMBEDDING_DIM, EDGE_MODEL_NAME, FRAMES_PER_CLIP

logger = logging.getLogger(__name__)

_device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_model: Optional[torch.nn.Module] = None

# Standard ImageNet preprocessing
_transform = T.Compose(
    [
        T.ToPILImage(),
        T.Resize(256),
        T.CenterCrop(224),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


def _build_backbone() -> torch.nn.Module:
    """Build the feature-extraction backbone (no classification head)."""
    if "mobilenet" in EDGE_MODEL_NAME.lower():
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        # Remove classifier; avgpool output is (B, 576)
        base.classifier = torch.nn.Identity()
    else:
        # Default: EfficientNet-B0
        base = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
        # Remove classifier head; avgpool output is (B, 1280)
        base.classifier = torch.nn.Identity()
    return base


def load_edge_model() -> torch.nn.Module:
    """Load (or return cached) edge model onto the appropriate device."""
    global _model
    if _model is not None:
        return _model

    logger.info("Loading edge model '%s' on %s", EDGE_MODEL_NAME, _device)
    _model = _build_backbone().to(_device)
    _model.eval()
    logger.info("Edge model ready (embedding_dim=%d)", EDGE_EMBEDDING_DIM)
    return _model


@torch.no_grad()
def extract_edge_embedding(frames: list[np.ndarray]) -> np.ndarray:
    """Extract a single embedding from a list of BGR uint8 frames.

    Steps:
        1. Uniformly sample ``FRAMES_PER_CLIP`` frames from the input list.
        2. Run each through the backbone to get per-frame features.
        3. Temporal average-pool across frames -> single vector.

    Returns:
        1-D numpy array of shape ``(EDGE_EMBEDDING_DIM,)``.
    """
    model = load_edge_model()

    if not frames:
        raise ValueError("No frames provided")

    # Uniform temporal sampling
    n = len(frames)
    indices = np.linspace(0, n - 1, min(FRAMES_PER_CLIP, n), dtype=int)
    sampled = [frames[i] for i in indices]

    # Preprocess: BGR -> RGB, then transform
    tensors = []
    for f in sampled:
        rgb = f[:, :, ::-1].copy()  # BGR -> RGB
        tensors.append(_transform(rgb))

    batch = torch.stack(tensors).to(_device)  # (T, 3, 224, 224)
    features = model(batch)  # (T, D)

    # Temporal average pooling
    embedding = features.mean(dim=0).cpu().numpy().astype(np.float32)

    # L2 normalise for cosine similarity in Qdrant
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding /= norm

    return embedding
