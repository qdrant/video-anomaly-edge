import { QdrantClient } from '@qdrant/js-client-rest';

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL || process.env.NEXT_PUBLIC_QDRANT_URL || 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;

    client = apiKey ? new QdrantClient({ url, apiKey }) : new QdrantClient({ url });
  }
  return client;
}

export const COLLECTION_NAME = process.env.COLLECTION_NAME || 'avenue_baseline';
