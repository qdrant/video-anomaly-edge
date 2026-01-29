import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:9876';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/stats`);

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to get stats' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
