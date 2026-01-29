import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params;
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get('run_id') || 'baseline';
  const feedId = searchParams.get('feed_id');

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'incidents', dataset, `${runId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    let incidents = JSON.parse(data);

    // Filter by feed if specified
    if (feedId && incidents.incidents) {
      incidents = {
        ...incidents,
        incidents: incidents.incidents.filter((i: { feed_id: string }) => i.feed_id === feedId),
      };
    }

    return NextResponse.json(incidents);
  } catch {
    return NextResponse.json({ incidents: [], total: 0 }, { status: 404 });
  }
}
