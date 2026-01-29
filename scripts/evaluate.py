#!/usr/bin/env python3
"""Evaluate anomaly detection on the UCF-Crime test set.

Computes AUC-ROC (standard metric for UCF-Crime), precision, recall, F1,
per-category breakdown, and operating point analysis.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def load_test_data(
    data_dir: Path,
    model_type: str,
) -> tuple[np.ndarray, list[dict]]:
    """Load test embeddings and metadata."""
    emb_file = data_dir / f"embeddings_{model_type}.npz"
    meta_file = data_dir / f"embeddings_{model_type}_meta.json"

    if not emb_file.exists() or not meta_file.exists():
        logger.error("Embeddings not found for model '%s'. Run embed_clips.py first.", model_type)
        sys.exit(1)

    loaded = np.load(emb_file)
    meta = json.loads(meta_file.read_text())

    # Filter to test set only
    test_indices = [i for i, m in enumerate(meta) if not m.get("is_training", True)]
    embeddings = loaded["embeddings"][test_indices]
    test_meta = [meta[i] for i in test_indices]

    logger.info("Loaded %d test embeddings (dim=%d)", len(embeddings), embeddings.shape[1])
    return embeddings, test_meta


def score_embeddings_knn(
    test_embeddings: np.ndarray,
    train_embeddings: np.ndarray,
    k: int = 5,
) -> np.ndarray:
    """Score test embeddings against training baseline using kNN cosine distance.

    Returns anomaly scores: 1 - mean(top-k cosine similarities).
    """
    from sklearn.metrics.pairwise import cosine_similarity

    logger.info("Computing kNN scores (k=%d) for %d test vs %d train...",
                k, len(test_embeddings), len(train_embeddings))

    # Process in batches to manage memory
    batch_size = 500
    scores = []

    for start in range(0, len(test_embeddings), batch_size):
        end = min(start + batch_size, len(test_embeddings))
        batch = test_embeddings[start:end]
        sims = cosine_similarity(batch, train_embeddings)  # (batch, train)
        # Top-k similarities per test sample
        topk = np.sort(sims, axis=1)[:, -k:]
        batch_scores = 1.0 - topk.mean(axis=1)
        scores.append(batch_scores)

        if start % 1000 == 0 and start > 0:
            logger.info("Scored %d/%d", start, len(test_embeddings))

    return np.concatenate(scores)


def score_embeddings_qdrant(
    test_embeddings: np.ndarray,
    collection_name: str,
    k: int = 5,
    mode: str = "cloud",
) -> np.ndarray:
    """Score test embeddings using Qdrant search."""
    from qdrant_client import QdrantClient

    if mode == "cloud":
        url = os.getenv("QDRANT_URL", "http://localhost:6333")
        api_key = os.getenv("QDRANT_API_KEY")
        client = QdrantClient(url=url, api_key=api_key if api_key else None)
    else:
        path = os.getenv("QDRANT_EDGE_PATH", "data/ucf_crime/qdrant_edge")
        client = QdrantClient(path=path)

    scores = []
    for i, emb in enumerate(test_embeddings):
        results = client.search(
            collection_name=collection_name,
            query_vector=emb.tolist(),
            limit=k,
        )
        if results:
            sims = [r.score for r in results]
            score = 1.0 - (sum(sims) / len(sims))
        else:
            score = 1.0
        scores.append(score)

        if (i + 1) % 200 == 0:
            logger.info("Scored %d/%d via Qdrant", i + 1, len(test_embeddings))

    return np.array(scores)


def compute_metrics(
    scores: np.ndarray,
    labels: np.ndarray,
    threshold: float | None = None,
) -> dict:
    """Compute AUC-ROC, precision, recall, F1 at a given threshold."""
    from sklearn.metrics import (
        roc_auc_score,
        precision_score,
        recall_score,
        f1_score,
        average_precision_score,
        roc_curve,
    )

    auc_roc = roc_auc_score(labels, scores)
    avg_precision = average_precision_score(labels, scores)

    # Find optimal threshold if not provided
    if threshold is None:
        fpr, tpr, thresholds = roc_curve(labels, scores)
        # Youden's J statistic
        j_scores = tpr - fpr
        best_idx = np.argmax(j_scores)
        threshold = float(thresholds[best_idx])

    preds = (scores > threshold).astype(int)
    precision = precision_score(labels, preds, zero_division=0)
    recall = recall_score(labels, preds, zero_division=0)
    f1 = f1_score(labels, preds, zero_division=0)

    return {
        "auc_roc": float(auc_roc),
        "average_precision": float(avg_precision),
        "threshold": float(threshold),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
    }


def per_category_metrics(
    scores: np.ndarray,
    labels: np.ndarray,
    categories: list[str],
    threshold: float,
) -> dict[str, dict]:
    """Compute metrics per anomaly category."""
    from sklearn.metrics import roc_auc_score

    results = {}
    unique_cats = sorted(set(categories))

    for cat in unique_cats:
        mask = np.array([c == cat for c in categories])
        cat_scores = scores[mask]
        cat_labels = labels[mask]

        n_total = len(cat_labels)
        n_anomalous = int(cat_labels.sum())
        n_normal = n_total - n_anomalous

        cat_result = {
            "count": n_total,
            "n_anomalous": n_anomalous,
            "n_normal": n_normal,
            "mean_score": float(cat_scores.mean()),
        }

        # AUC only meaningful if both classes present
        if n_anomalous > 0 and n_normal > 0:
            cat_result["auc_roc"] = float(roc_auc_score(cat_labels, cat_scores))
        elif n_anomalous > 0:
            cat_result["auc_roc"] = None
            cat_result["mean_anomaly_score"] = float(cat_scores.mean())

        preds = (cat_scores > threshold).astype(int)
        cat_result["detection_rate"] = float(preds.sum() / len(preds)) if len(preds) > 0 else 0.0

        results[cat] = cat_result

    return results


def operating_point_analysis(
    scores: np.ndarray,
    labels: np.ndarray,
    clips_per_hour: float = 360,  # 10s clips -> 360/hr
) -> list[dict]:
    """Analyze performance at various FP/hour budgets."""
    from sklearn.metrics import roc_curve

    fpr, tpr, thresholds = roc_curve(labels, scores)

    # FP/hour budgets to evaluate
    fp_budgets = [0.5, 1, 2, 5, 10, 20, 50]
    n_normal = (labels == 0).sum()
    results = []

    for budget in fp_budgets:
        target_fpr = budget / clips_per_hour
        # Find closest operating point
        idx = np.searchsorted(fpr, target_fpr)
        idx = min(idx, len(fpr) - 1)

        results.append({
            "fp_per_hour": budget,
            "threshold": float(thresholds[min(idx, len(thresholds) - 1)]),
            "fpr": float(fpr[idx]),
            "tpr": float(tpr[idx]),
            "recall": float(tpr[idx]),
        })

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate anomaly detection on UCF-Crime test set",
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data/ucf_crime"))
    parser.add_argument(
        "--model",
        choices=["cloud", "edge", "both"],
        default="both",
        help="Which model embeddings to evaluate",
    )
    parser.add_argument("--k", type=int, default=5, help="k for kNN scoring")
    parser.add_argument(
        "--use-qdrant",
        action="store_true",
        help="Score via Qdrant instead of direct kNN",
    )
    parser.add_argument(
        "--collection",
        default="ucf_crime_baseline",
        help="Qdrant collection name",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Fixed anomaly threshold (default: auto-optimize)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    data_dir = args.data_dir.resolve()
    eval_dir = data_dir / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)

    models_to_eval = ["cloud", "edge"] if args.model == "both" else [args.model]
    all_results = {}

    for model_type in models_to_eval:
        logger.info("=" * 60)
        logger.info("Evaluating model: %s", model_type)
        logger.info("=" * 60)

        # Load test data
        try:
            test_embeddings, test_meta = load_test_data(data_dir, model_type)
        except SystemExit:
            logger.warning("Skipping %s model (embeddings not found)", model_type)
            continue

        # Ground truth: Normal = 0, any anomaly = 1
        labels = np.array([
            0 if m["anomaly_type"] == "Normal" else 1
            for m in test_meta
        ])
        categories = [m["anomaly_type"] for m in test_meta]

        logger.info("Test set: %d normal, %d anomalous",
                     (labels == 0).sum(), (labels == 1).sum())

        # Score
        t0 = time.time()
        if args.use_qdrant:
            scores = score_embeddings_qdrant(
                test_embeddings, args.collection, args.k, mode=model_type,
            )
        else:
            # Load training embeddings for direct kNN
            emb_file = data_dir / f"embeddings_{model_type}.npz"
            meta_file = data_dir / f"embeddings_{model_type}_meta.json"
            all_emb = np.load(emb_file)["embeddings"]
            all_meta = json.loads(meta_file.read_text())
            train_indices = [i for i, m in enumerate(all_meta) if m.get("is_training", True)]
            train_embeddings = all_emb[train_indices]
            scores = score_embeddings_knn(test_embeddings, train_embeddings, args.k)

        scoring_time = time.time() - t0
        logger.info("Scoring took %.1fs", scoring_time)

        # Overall metrics
        metrics = compute_metrics(scores, labels, args.threshold)
        logger.info("AUC-ROC: %.4f", metrics["auc_roc"])
        logger.info("Average Precision: %.4f", metrics["average_precision"])
        logger.info("Threshold: %.4f", metrics["threshold"])
        logger.info("Precision: %.4f  Recall: %.4f  F1: %.4f",
                     metrics["precision"], metrics["recall"], metrics["f1"])

        # Per-category
        cat_metrics = per_category_metrics(scores, labels, categories, metrics["threshold"])
        logger.info("\nPer-category breakdown:")
        for cat, cm in sorted(cat_metrics.items()):
            auc_str = f"AUC={cm['auc_roc']:.3f}" if cm.get("auc_roc") is not None else "AUC=N/A"
            logger.info("  %-15s n=%d %s detect_rate=%.2f mean_score=%.4f",
                         cat, cm["count"], auc_str, cm["detection_rate"], cm["mean_score"])

        # Operating points
        op_analysis = operating_point_analysis(scores, labels)
        logger.info("\nOperating point analysis (FP/hour):")
        for op in op_analysis:
            logger.info("  %5.1f FP/hr -> threshold=%.4f recall=%.3f",
                         op["fp_per_hour"], op["threshold"], op["recall"])

        model_results = {
            "model": model_type,
            "n_test": len(test_embeddings),
            "n_normal": int((labels == 0).sum()),
            "n_anomalous": int((labels == 1).sum()),
            "scoring_time_s": scoring_time,
            "overall": metrics,
            "per_category": cat_metrics,
            "operating_points": op_analysis,
        }
        all_results[model_type] = model_results

    # Save results
    results_path = eval_dir / "evaluation_results.json"
    results_path.write_text(json.dumps(all_results, indent=2))
    logger.info("\nResults saved to: %s", results_path)

    # Edge vs Cloud comparison
    if "cloud" in all_results and "edge" in all_results:
        logger.info("\n" + "=" * 60)
        logger.info("EDGE vs CLOUD COMPARISON")
        logger.info("=" * 60)
        cloud = all_results["cloud"]["overall"]
        edge = all_results["edge"]["overall"]
        logger.info("  %-20s %8s %8s %8s", "", "AUC-ROC", "F1", "Recall")
        logger.info("  %-20s %8.4f %8.4f %8.4f", "Cloud (VideoMAE)",
                     cloud["auc_roc"], cloud["f1"], cloud["recall"])
        logger.info("  %-20s %8.4f %8.4f %8.4f", "Edge (MobileNet)",
                     edge["auc_roc"], edge["f1"], edge["recall"])
        logger.info("  %-20s %8.4f %8.4f %8.4f", "Delta",
                     cloud["auc_roc"] - edge["auc_roc"],
                     cloud["f1"] - edge["f1"],
                     cloud["recall"] - edge["recall"])


if __name__ == "__main__":
    main()
