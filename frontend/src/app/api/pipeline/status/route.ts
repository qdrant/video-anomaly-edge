import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    mode: 'normal',
    mode_description: 'All systems operational',
    embed_queue_depth: 0,
    score_queue_depth: 0,
    caption_queue_depth: 0,
    drop_rate: 0,
    is_healthy: true,
  });
}
