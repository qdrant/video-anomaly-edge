#!/usr/bin/env bash
# Build the ShanghaiTech test clips + thumbnails the Sentinel frontend streams from ../data.
# usage: build_clips.sh <frames_root> <feeds_dir> <data_root>
#   frames_root: dir containing one folder of jpg frames per test video (e.g. .../testing/frames/01_0014/*.jpg)
#   feeds_dir:   frontend/public/data/feeds/shanghaitech (only clips referenced there are built)
#   data_root:   ~/sentinel/data  -> writes shanghaitech/clips/testing/<id>.mp4 and shanghaitech/thumbnails/testing/<id>.jpg
set -euo pipefail
frames=$1; feeds=$2; data=$3
clips=$data/shanghaitech/clips/testing; thumbs=$data/shanghaitech/thumbnails/testing
mkdir -p "$clips" "$thumbs"
ids=$(python3 -c "
import json,glob,sys
ids=set()
for f in glob.glob('$feeds/shanghaitech_scene_*.json'):
    ids.update(s['segment_id'] for s in json.load(open(f))['segments'])
print(' '.join(sorted(ids)))")
n=0; missing=0
for id in $ids; do
  src=$frames/$id
  if [ ! -d "$src" ]; then echo "missing frames for $id"; missing=$((missing+1)); continue; fi
  [ -s "$clips/$id.mp4" ] || ffmpeg -v error -y -framerate 24 -pattern_type glob -i "$src/*.jpg" \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart "$clips/$id.mp4"
  [ -s "$thumbs/$id.jpg" ] || ffmpeg -v error -y -i "$clips/$id.mp4" -frames:v 1 -vf "scale=640:-2" -q:v 4 "$thumbs/$id.jpg"
  n=$((n+1))
done
echo "built $n clips, $missing missing"; du -sh "$clips" "$thumbs"
