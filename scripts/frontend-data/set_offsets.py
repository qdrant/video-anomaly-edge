"""Set start_time/end_time on each clip point to its offset in the shanghaitech_master feed,
so the search preview seeks to the matching clip. usage: QDRANT_URL=.. [QDRANT_API_KEY=..] python3 set_offsets.py <master.json> <collection>"""
import json, os, sys, uuid
from qdrant_client import QdrantClient
master, coll = sys.argv[1], sys.argv[2]
segs = json.load(open(master))['segments']
first, last = {}, {}
for s in segs:
    cid = s['segment_id'][len('test_'):].rsplit('_', 1)[0]
    first.setdefault(cid, s['feed_start_ms']); last[cid] = s['feed_start_ms'] + s['duration_ms']
q = QdrantClient(url=os.environ['QDRANT_URL'], api_key=os.environ.get('QDRANT_API_KEY'))
n = 0
for cid in first:
    pid = str(uuid.uuid5(uuid.NAMESPACE_URL, f'shanghaitech/{cid}'))
    q.set_payload(coll, payload={'start_time': first[cid] / 1000, 'end_time': last[cid] / 1000}, points=[pid]); n += 1
print('updated', n, 'points in', coll)
