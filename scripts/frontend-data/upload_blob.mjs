// Upload Sentinel clips + thumbnails to Vercel Blob with stable pathnames.
// usage: BLOB_READ_WRITE_TOKEN=... node upload_blob.mjs <data_root>   (data_root/shanghaitech/{clips,thumbnails}/testing)
import { put, list } from '@vercel/blob';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
const root = process.argv[2];
const existing = new Set();
{ const r = await list({ prefix: 'shanghaitech/', limit: 1000 }); for (const b of r.blobs) existing.add(b.pathname); }
let base = null, n = 0;
for (const kind of ['clips', 'thumbnails']) {
  const dir = join(root, 'shanghaitech', kind, 'testing');
  for (const f of (await readdir(dir)).sort()) {
    const pathname = `shanghaitech/${kind}/testing/${f}`;
    if (existing.has(pathname)) { continue; }
    const r = await put(pathname, await readFile(join(dir, f)), { access: 'public', addRandomSuffix: false, contentType: f.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' });
    base = base || r.url.replace(`/${pathname}`, '');
    n++; if (n % 20 === 0) console.log(n, 'uploaded');
  }
}
console.log('uploaded', n, 'new files; base URL:', base || '(nothing new; see existing)');
