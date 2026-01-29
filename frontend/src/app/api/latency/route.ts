import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    embed_p95_ms: 45,
    search_p95_ms: 12,
    total_p95_ms: 57,
  });
}
