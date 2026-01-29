#!/usr/bin/env python3
"""Larger quick eval: embed 200 train normals + all test clips for AUC-ROC."""
import json, numpy as np, torch, time
from pathlib import Path
from collections import defaultdict
from sklearn.metrics import roc_auc_score, average_precision_score, precision_recall_fscore_support

from transformers import VideoMAEForVideoClassification, VideoMAEImageProcessor

torch.set_num_threads(4)
proc = VideoMAEImageProcessor.from_pretrained('MCG-NJU/videomae-base-finetuned-kinetics')
model = VideoMAEForVideoClassification.from_pretrained('MCG-NJU/videomae-base-finetuned-kinetics')
model.eval()

def extract_frames(path, n=16):
    import av
    c = av.open(path)
    frames = [f.to_ndarray(format='rgb24') for f in c.decode(video=0)]
    c.close()
    if not frames:
        return []
    idx = np.linspace(0, len(frames)-1, n, dtype=int)
    return [frames[i] for i in idx]

def embed(path):
    frames = extract_frames(path)
    if not frames:
        return None
    with torch.no_grad():
        inputs = proc(list(frames), return_tensors='pt')
        out = model(inputs['pixel_values'], output_hidden_states=True)
        emb = out.hidden_states[-1][:, 0, :].squeeze(0).cpu().numpy().astype(np.float32)
        emb /= np.linalg.norm(emb)
        return emb

manifest = json.loads(Path('data/ucf_crime/clip_manifest.json').read_text())
clips = manifest['clips']

# 200 random training normals for baseline
import random
random.seed(42)
normal_train = [c for c in clips if c['is_training'] and c['anomaly_type'] == 'Normal']
random.shuffle(normal_train)
normal_train = normal_train[:200]

# ALL test clips
test_clips = [c for c in clips if not c['is_training']]
print(f"Embedding {len(normal_train)} train normals + {len(test_clips)} test clips...")

t0 = time.time()
train_embs = []
for i, c in enumerate(normal_train):
    e = embed(c['clip_path'])
    if e is not None:
        train_embs.append(e)
    if (i+1) % 50 == 0:
        print(f"  Train: {i+1}/{len(normal_train)}")
train_embs = np.stack(train_embs)
print(f"Baseline: {len(train_embs)} normals in {time.time()-t0:.0f}s")

from sklearn.metrics.pairwise import cosine_similarity

# Score all test clips
labels = []  # 1=anomaly, 0=normal
scores = []
categories = []
t1 = time.time()
for i, c in enumerate(test_clips):
    e = embed(c['clip_path'])
    if e is None:
        continue
    sims = cosine_similarity(e.reshape(1,-1), train_embs)[0]
    topk = np.sort(sims)[-5:]
    s = 1.0 - topk.mean()
    scores.append(s)
    is_anom = 1 if c['anomaly_type'] != 'Normal' else 0
    labels.append(is_anom)
    categories.append(c['anomaly_type'])
    if (i+1) % 20 == 0:
        print(f"  Test: {i+1}/{len(test_clips)} ({(i+1)/(time.time()-t1):.1f} clips/s)")

labels = np.array(labels)
scores = np.array(scores)

print(f"\n{'='*60}")
print(f"RESULTS ({len(scores)} test clips, {labels.sum()} anomaly, {(1-labels).sum()} normal)")
print(f"{'='*60}")

auc = roc_auc_score(labels, scores)
ap = average_precision_score(labels, scores)
print(f"AUC-ROC:           {auc:.4f}")
print(f"Average Precision: {ap:.4f}")

# Best threshold by F1
best_f1, best_t = 0, 0
for t in np.linspace(scores.min(), scores.max(), 200):
    preds = (scores >= t).astype(int)
    p, r, f1, _ = precision_recall_fscore_support(labels, preds, average='binary', zero_division=0)
    if f1 > best_f1:
        best_f1, best_t = f1, t
        best_p, best_r = p, r

print(f"Best F1:           {best_f1:.4f} (threshold={best_t:.4f})")
print(f"  Precision:       {best_p:.4f}")
print(f"  Recall:          {best_r:.4f}")

# Per-category
print(f"\nPer-category:")
by_cat = defaultdict(list)
for s, l, cat in zip(scores, labels, categories):
    by_cat[cat].append((s, l))
for cat in sorted(by_cat.keys()):
    vals = by_cat[cat]
    ss = [v[0] for v in vals]
    detect = sum(1 for v in vals if v[0] >= best_t) / len(vals)
    print(f"  {cat:20s} n={len(vals):4d}  mean_score={np.mean(ss):.4f}  detect_rate={detect:.2f}")

print(f"\nTotal time: {time.time()-t0:.0f}s")
