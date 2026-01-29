import { NextResponse } from 'next/server';
import { getQdrantClient, COLLECTION_NAME } from '@/lib/qdrant';

export async function GET() {
  let qdrantConnected = false;
  let collectionPoints = 0;

  try {
    const client = getQdrantClient();
    const info = await client.getCollection(COLLECTION_NAME);
    qdrantConnected = true;
    collectionPoints = info.points_count || 0;
  } catch (error) {
    console.error('Qdrant connection error:', error);
  }

  return NextResponse.json({
    status: qdrantConnected ? 'healthy' : 'degraded',
    qdrant_connected: qdrantConnected,
    collection_points: collectionPoints,
    collection_name: COLLECTION_NAME,
  });
}
