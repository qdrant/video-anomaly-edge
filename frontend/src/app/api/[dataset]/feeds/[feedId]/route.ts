import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string; feedId: string }> }
) {
  const { dataset, feedId } = await params;

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'feeds', dataset, `${feedId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }
}
