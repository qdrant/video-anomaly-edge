import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:9876';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/clip/${clipId}`);

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat clip API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
