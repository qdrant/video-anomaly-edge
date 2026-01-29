import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string; incidentId: string }> }
) {
  const { dataset, incidentId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const runId = searchParams.get('run_id') || 'baseline';

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'incidents', dataset, `${runId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const { incidents } = JSON.parse(data);

    const incident = incidents.find((i: { incident_id: string }) => i.incident_id === incidentId);

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    return NextResponse.json(incident);
  } catch {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }
}
