import { NextRequest, NextResponse } from 'next/server';
import { getQdrantClient, COLLECTION_NAME } from '@/lib/qdrant';
import { embedText } from '@/lib/twelvelabs';

function transformResult(result: { score: number; payload?: Record<string, unknown> | null }) {
  return {
    clip_id: result.payload?.clip_id as string,
    source_video: result.payload?.source_video as string,
    clip_index: result.payload?.clip_index as number,
    start_time: result.payload?.start_time as number,
    end_time: result.payload?.end_time as number,
    similarity: result.score,
    is_anomaly: result.payload?.is_anomaly as boolean,
    thumbnail_url: result.payload?.thumbnail_url as string || `/thumbnails/testing/${result.payload?.clip_id}.jpg`,
    dataset_id: result.payload?.dataset_id as string | undefined,
    label: result.payload?.label as string | undefined,
    anomaly_type: result.payload?.anomaly_type as string | undefined,
    feed_id: result.payload?.feed_id as string | undefined,
    severity: result.payload?.severity as number | undefined,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params;
  const body = await request.json();
  const { query, limit = 20 } = body;

  const client = getQdrantClient();

  // Try vector search via Twelve Labs embedding
  try {
    const queryEmbedding = await embedText(query);

    const searchResults = await client.search(COLLECTION_NAME, {
      vector: { name: 'v_clip', vector: queryEmbedding },
      limit,
      with_payload: true,
    });

    if (searchResults.length > 0) {
      return NextResponse.json({
        query,
        results: searchResults.map(transformResult),
      });
    }
  } catch (err) {
    console.error('Vector search failed, falling back to text filter:', err);
  }

  // Fallback: keyword match on payload fields
  try {
    const keywords = query.toLowerCase().split(/\s+/);

    const scrollResult = await client.scroll(COLLECTION_NAME, {
      limit: 300,
      with_payload: true,
    });

    const scored = scrollResult.points
      .map((pt) => {
        const desc = ((pt.payload?.description as string) || '').toLowerCase();
        const label = ((pt.payload?.label as string) || '').toLowerCase();
        const atype = ((pt.payload?.anomaly_type as string) || '').toLowerCase();
        const text = `${desc} ${label} ${atype}`;

        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw)) score += 1;
        }
        return { point: pt, score: score / keywords.length };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const results = scored.map((s) => transformResult({
      score: s.score,
      payload: s.point.payload as Record<string, unknown>,
    }));

    return NextResponse.json({ query, results });
  } catch (error) {
    console.error('Fallback search failed:', error);
    return NextResponse.json(
      { query, results: [], error: String(error) },
      { status: 500 }
    );
  }
}
