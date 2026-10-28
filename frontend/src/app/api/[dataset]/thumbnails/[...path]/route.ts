import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_ROOT = join(process.cwd(), '..', 'data');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dataset: string; path: string[] }> }
) {
  const { dataset, path: pathParts } = await params;
  const subPath = pathParts.join('/');

  // Hosted mode: media lives in Vercel Blob (or any static host); redirect there.
  const base = process.env.CLIP_BASE_URL;
  if (base) {
    return NextResponse.redirect(`${base.replace(/\/$/, '')}/${dataset}/thumbnails/${subPath}`, 307);
  }
  const filename = pathParts[pathParts.length - 1];
  const dir = pathParts.slice(0, -1).join('/');

  // Local filesystem (dev)
  const localCandidates = [
    join(DATA_ROOT, dataset, 'thumbnails', subPath),
  ];
  if (!filename.startsWith('test_')) {
    const base = filename.replace('.jpg', '');
    localCandidates.push(
      join(DATA_ROOT, dataset, 'thumbnails', dir, `test_${base}_000.jpg`),
      join(DATA_ROOT, dataset, 'thumbnails', dir, `test_${base}.jpg`),
    );
    // Extract core id: st_01_w_01_0014 -> 01_0014, w_01_0014 -> 01_0014
    let coreId = base;
    const stMatch = base.match(/^st_\d+_w_(.+)$/);
    if (stMatch) coreId = stMatch[1];
    else if (base.startsWith('w_')) coreId = base.slice(2);

    if (coreId !== base) {
      localCandidates.push(
        join(DATA_ROOT, dataset, 'thumbnails', dir, `${coreId}.jpg`),
        join(DATA_ROOT, dataset, 'thumbnails', dir, `test_${coreId}_000.jpg`),
      );
    }
  }

  for (const filePath of localCandidates) {
    if (existsSync(filePath)) {
      try {
        const data = await readFile(filePath);
        return new NextResponse(data, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      } catch {
        // try next
      }
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
