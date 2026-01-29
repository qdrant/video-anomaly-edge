#!/usr/bin/env python3
"""Quick proof-of-life: does VideoMAE separate normal from anomaly on UCF-Crime?"""
import json, numpy as np, torch
from pathlib import Path
from collections import defaultdict

from transformers import VideoMAEForVideoClassification, VideoMAEImageProcessor

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

def score(emb, baseline, k=3):
    from sklearn.metrics.pairwise import cosine_similarity
    sims = cosine_similarity(emb.reshape(1,-1), baseline)[0]
    topk = np.sort(sims)[-k:]
    return 1.0 - topk.mean()

manifest = json.loads(Path('data/ucf_crime/clip_manifest.json').read_text())
clips = manifest['clips']

normal_train = [c for c in clips if c['is_training'] and c['anomaly_type'] == 'Normal'][:30]
normal_test  = [c for c in clips if not c['is_training'] and c['anomaly_type'] == 'Normal'][:10]

by_type = defaultdict(list)
for c in clips:
    if not c['is_training'] and c['anomaly_type'] != 'Normal':
        by_type[c['anomaly_type']].append(c)
anomaly_test = []
for cat in sorted(by_type.keys())[:5]:
    anomaly_test.extend(by_type[cat][:3])

print(f"Embedding {len(normal_train)} train normals, {len(normal_test)} test normals, {len(anomaly_test)} anomaly test...")

train_embs = []
for c in normal_train:
    e = embed(c['clip_path'])
    if e is not None:
        train_embs.append(e)
train_embs = np.stack(train_embs)
print(f"Baseline: {len(train_embs)} normal embeddings")

print("\n--- Normal test clips ---")
normal_scores = []
for c in normal_test:
    e = embed(c['clip_path'])
    if e is not None:
        s = score(e, train_embs)
        normal_scores.append(s)
        print(f"  {c['source_video']}: score={s:.4f}")

print("\n--- Anomaly test clips ---")
anomaly_scores = []
for c in anomaly_test:
    e = embed(c['clip_path'])
    if e is not None:
        s = score(e, train_embs)
        anomaly_scores.append(s)
        print(f"  [{c['anomaly_type']}] {c['source_video']}: score={s:.4f}")

print(f"\n=== SUMMARY ===")
nm = np.mean(normal_scores)
ns = np.std(normal_scores)
am = np.mean(anomaly_scores)
astd = np.std(anomaly_scores)
print(f"Normal  mean={nm:.4f}  std={ns:.4f}  range=[{np.min(normal_scores):.4f}, {np.max(normal_scores):.4f}]")
print(f"Anomaly mean={am:.4f}  std={astd:.4f}  range=[{np.min(anomaly_scores):.4f}, {np.max(anomaly_scores):.4f}]")
sep = (am - nm) / (ns + astd + 1e-8)
print(f"Separation (higher=better): {sep:.4f}")
if am > nm:
    print("PASS: Anomaly scores HIGHER than normal (correct direction)")
else:
    print("FAIL: Anomaly scores lower than normal (inverted)")
