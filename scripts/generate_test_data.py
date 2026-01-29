"""Generate synthetic test videos for pipeline validation using ffmpeg."""

import json
import subprocess
import random
from pathlib import Path


def generate_clip(output_path: Path, duration: float, bg_color: str, text: str, resolution: str = "320x240"):
    """Generate a synthetic video clip using ffmpeg."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c={bg_color}:s={resolution}:d={duration}:r=24",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def main():
    base_dir = Path("data/ucf_crime/test_clips")
    normal_dir = base_dir / "normal"
    anomaly_dir = base_dir / "anomaly"
    normal_dir.mkdir(parents=True, exist_ok=True)
    anomaly_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"clips": []}
    normal_colors = ["blue", "green", "darkblue", "darkgreen", "teal"]
    anomaly_types = ["Fighting", "Robbery", "Arson", "Vandalism", "Shooting",
                     "Burglary", "Abuse", "Explosion", "Assault", "Shoplifting"]

    # Generate 20 normal clips
    for i in range(20):
        fname = f"normal_{i:03d}.mp4"
        path = normal_dir / fname
        duration = random.uniform(3.0, 5.0)
        color = random.choice(normal_colors)
        generate_clip(path, duration, color, f"Normal_{i:03d}")
        manifest["clips"].append({
            "path": str(path),
            "label": "normal",
            "duration": round(duration, 2),
            "index": i,
        })
        print(f"Created {path}")

    # Generate 10 anomaly clips
    for i in range(10):
        fname = f"anomaly_{i:03d}.mp4"
        path = anomaly_dir / fname
        duration = random.uniform(3.0, 5.0)
        atype = anomaly_types[i]
        generate_clip(path, duration, "red", atype)
        manifest["clips"].append({
            "path": str(path),
            "label": "anomaly",
            "anomaly_type": atype,
            "duration": round(duration, 2),
            "index": i,
        })
        print(f"Created {path}")

    manifest_path = base_dir / "clip_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest saved to {manifest_path}")
    print(f"Total clips: {len(manifest['clips'])} (20 normal, 10 anomaly)")


if __name__ == "__main__":
    main()
