import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.TWELVE_LABS_API_KEY;
  const hasKey = !!apiKey && apiKey.startsWith('tlk_');

  return NextResponse.json({
    pegasus_available: hasKey,
    corpus_loaded: true,
    corpus_clips: 107,
    capabilities: hasKey
      ? ['video-qa', 'scene-description', 'anomaly-explanation']
      : ['local-commands'],
  });
}
