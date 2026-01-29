import { NextRequest, NextResponse } from 'next/server';
import { getQdrantClient, COLLECTION_NAME } from '@/lib/qdrant';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params;
  const body = await request.json();
  const { clip_id, limit = 10, include_training = true } = body;

  try {
    const client = getQdrantClient();

    // First, get the clip's vector
    const clipResults = await client.scroll(COLLECTION_NAME, {
      filter: { must: [{ key: 'clip_id', match: { value: clip_id } }] },
      limit: 1,
      with_vector: true,
      with_payload: true,
    });

    if (!clipResults.points || clipResults.points.length === 0) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const vectors = clipResults.points[0].vector as Record<string, number[]>;
    const clipVector = vectors['v_clip'] || (clipResults.points[0].vector as number[]);

    // Search for similar clips
    const filter = include_training
      ? { must_not: [{ key: 'clip_id', match: { value: clip_id } }] }
      : {
          must: [{ key: 'is_training', match: { value: false } }],
          must_not: [{ key: 'clip_id', match: { value: clip_id } }],
        };

    const searchResults = await client.search(COLLECTION_NAME, {
      vector: { name: 'v_clip', vector: clipVector },
      limit,
      filter,
      with_payload: true,
    });

    const results = searchResults.map((result) => ({
      clip_id: result.payload?.clip_id as string,
      source_video: result.payload?.source_video as string,
      start_time: result.payload?.start_time as number,
      end_time: result.payload?.end_time as number,
      similarity: result.score,
      is_anomaly: result.payload?.is_anomaly as boolean,
      is_training: result.payload?.is_training as boolean,
      thumbnail_url: result.payload?.is_training
        ? `/thumbnails/training/${result.payload?.clip_id}.jpg`
        : `/thumbnails/testing/${result.payload?.clip_id}.jpg`,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('Similar search failed:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
