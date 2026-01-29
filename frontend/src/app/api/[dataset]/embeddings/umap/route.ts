import { NextRequest, NextResponse } from 'next/server';
import { getQdrantClient, COLLECTION_NAME } from '@/lib/qdrant';
import { TSNE } from '@keckelt/tsne';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Cache t-SNE result to avoid recomputing on every request
let cachedResult: { points: unknown[]; timestamp: number } | null = null; // v2: unknown->normal
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params;

  // Return cached if fresh
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    return NextResponse.json({ points: cachedResult.points });
  }

  const client = getQdrantClient();

  try {
    // Fetch points WITH vectors from Qdrant
    const result = await client.scroll(COLLECTION_NAME, {
      limit: 500,
      with_payload: true,
      with_vector: ['v_clip'],
    });

    // Filter to dataset if needed (shanghaitech points have dataset_id)
    const filtered = result.points.filter((pt) => {
      const p = pt.payload as Record<string, unknown>;
      const dsId = p.dataset_id as string | undefined;
      // Include if no dataset_id set or matches
      return !dsId || dsId === dataset;
    });

    // Extract vectors for t-SNE
    const vectors: number[][] = filtered.map((pt) => {
      const v = pt.vector as Record<string, number[]>;
      return v?.v_clip || [];
    }).filter(v => v.length > 0);

    // Run t-SNE on real vectors
    let coords: number[][] = [];
    if (vectors.length > 0) {
      const tsne = new TSNE({
        dim: 2,
        perplexity: Math.min(30, Math.floor(vectors.length / 3)),
        epsilon: 10,
      });
      tsne.initDataRaw(vectors);
      // Run 500 iterations
      for (let i = 0; i < 500; i++) {
        tsne.step();
      }
      coords = tsne.getSolution();
    }

    // Normalize coords to [0, 1]
    if (coords.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [cx, cy] of coords) {
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
      }
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      coords = coords.map(([cx, cy]) => [
        (cx - minX) / rangeX,
        (cy - minY) / rangeY,
      ]);
    }

    const NORMAL_TYPES = new Set(['', 'normal']);

    const points = filtered.map((pt, i) => {
      const p = pt.payload as Record<string, unknown>;
      const startTime = (p.start_time as number) || 0;
      const endTime = (p.end_time as number) || 10;
      const anomalyType = (p.anomaly_type as string) || '';
      // Infer is_anomaly from anomaly_type when not explicitly set
      const isAnomaly = p.is_anomaly === true || (p.is_anomaly === undefined && anomalyType !== '' && !NORMAL_TYPES.has(anomalyType));

      return {
        clip_id: (p.clip_id as string) || `clip_${i}`,
        x: coords[i]?.[0] ?? Math.random(),
        y: coords[i]?.[1] ?? Math.random(),
        is_training: (p.is_training as boolean) || false,
        is_anomaly: isAnomaly,
        start_time: startTime,
        end_time: endTime,
        description: (p.description as string) || (p.label as string) || '',
        severity: (p.severity as string) || undefined,
        scene: (p.scene_id as string) || (p.source_video as string) || '',
        time_range: `${formatTime(startTime)} - ${formatTime(endTime)}`,
        thumbnail_url: (p.thumbnail_url as string) || '',
        anomaly_type: isAnomaly ? (anomalyType === 'unknown' || anomalyType === '' ? 'normal' : anomalyType) : '',
        label: (p.label as string) || '',
        feed_id: (p.feed_id as string) || '',
      };
    });

    cachedResult = { points, timestamp: Date.now() };
    return NextResponse.json({ points });
  } catch (error) {
    console.error('UMAP endpoint error:', error);
    return NextResponse.json({ points: [], error: String(error) }, { status: 500 });
  }
}
