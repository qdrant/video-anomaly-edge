import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string; incidentId: string }> }
) {
  const { dataset, incidentId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  const runId = searchParams.get('run_id') || 'baseline';

  // In a real app, this would update a database
  // For demo purposes, just return success
  // The frontend will update its local state

  if (!status || !['new', 'confirmed', 'false_alarm', 'investigating'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    incident_id: incidentId,
    status,
    dataset,
    run_id: runId,
  });
}
