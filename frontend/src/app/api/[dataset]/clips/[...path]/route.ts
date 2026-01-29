import { NextRequest, NextResponse } from 'next/server';
import { existsSync, createReadStream } from 'fs';
import { stat as fsStat } from 'fs/promises';
import { join } from 'path';

const DATA_ROOT = join(process.cwd(), '..', 'data');

function localPath(dataset: string, subPath: string, filename: string): string | null {
  const base = filename.replace('.mp4', '');
  const candidates = [
    join(DATA_ROOT, dataset, 'clips', subPath),
    join(DATA_ROOT, dataset, 'testing', 'concat', filename),
  ];
  // Extract core id: st_01_w_01_0014 -> 01_0014, w_01_0014 -> 01_0014
  let coreId = base;
  const stMatch = base.match(/^st_\d+_w_(.+)$/);
  if (stMatch) coreId = stMatch[1];
  else if (base.startsWith('w_')) coreId = base.slice(2);

  if (coreId !== base) {
    candidates.push(join(DATA_ROOT, dataset, 'clips', 'testing', `test_${coreId}_000.mp4`));
    candidates.push(join(DATA_ROOT, dataset, 'clips', 'testing', `${coreId}.mp4`));
  }
  // Also try test_ prefix directly
  if (!base.startsWith('test_')) {
    candidates.push(join(DATA_ROOT, dataset, 'clips', 'testing', `test_${base}_000.mp4`));
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string; path: string[] }> }
) {
  const { dataset, path: pathParts } = await params;
  const subPath = pathParts.join('/');
  const filename = pathParts[pathParts.length - 1];

  // Local filesystem (dev)
  const file = localPath(dataset, subPath, filename);
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fileStat = await fsStat(file);
  const fileSize = fileStat.size;
  const range = request.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
    const chunkSize = end - start + 1;

    const stream = createReadStream(file, { start, end });
    const readable = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: string | Buffer) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() { stream.destroy(); },
    });

    return new NextResponse(readable, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const stream = createReadStream(file);
  const readable = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: string | Buffer) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() { stream.destroy(); },
  });

  return new NextResponse(readable, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
