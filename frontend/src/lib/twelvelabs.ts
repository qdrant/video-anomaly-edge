// Twelve Labs API client for video search and analysis

const API_BASE = '/api';

export interface TwelveLabsSearchResult {
  video_id: string;
  score: number;
  start: number;
  end: number;
  confidence: string;
  metadata: Record<string, unknown>;
}

export interface TwelveLabsAnalysisResult {
  video_id: string;
  text: string;
  latency_ms: number;
}

export interface TwelveLabsStatus {
  enabled: boolean;
  marengo_model: string;
  pegasus_model: string;
}

export async function getTwelveLabsStatus(): Promise<TwelveLabsStatus> {
  const res = await fetch(`${API_BASE}/twelvelabs/status`);
  if (!res.ok) throw new Error('Failed to get Twelve Labs status');
  return res.json();
}

export async function searchVideos(
  query: string,
  maxClips: number = 10
): Promise<{ query: string; results: TwelveLabsSearchResult[] }> {
  const form = new FormData();
  form.append('query', query);
  form.append('max_clips', maxClips.toString());

  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function analyzeVideo(
  videoId: string,
  prompt: string
): Promise<TwelveLabsAnalysisResult> {
  const form = new FormData();
  form.append('video_id', videoId);
  form.append('prompt', prompt);

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Analysis failed');
  return res.json();
}

export async function uploadToTwelveLabs(
  file: File,
  indexType: string = 'both'
): Promise<Record<string, string>> {
  const form = new FormData();
  form.append('file', file);
  form.append('index_type', indexType);

  const res = await fetch(`${API_BASE}/twelvelabs/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function uploadToVSS(
  file: File
): Promise<{ status: string; total_chunks?: number; uploaded_chunks?: number; vss_file_ids?: string[] }> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/vss/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('VSS upload failed');
  return res.json();
}

// Server-side: embed a text query with Marengo for vector search against clip embeddings.
// Same model must be used for the clip embeddings in the collection.
const TL_API = process.env.TWELVE_LABS_API_URL || 'https://api.twelvelabs.io/v1.3';
const TL_EMBED_MODEL = process.env.TWELVE_LABS_EMBED_MODEL || 'Marengo-retrieval-2.7';

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.TWELVE_LABS_API_KEY;
  if (!apiKey) throw new Error('TWELVE_LABS_API_KEY not set');
  const form = new FormData();
  form.append('model_name', TL_EMBED_MODEL);
  form.append('text', text);
  form.append('text_truncate', 'end');
  const res = await fetch(`${TL_API}/embed`, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form });
  if (!res.ok) throw new Error(`Twelve Labs embed failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const seg = data?.text_embedding?.segments?.[0];
  const vec = seg?.float ?? seg?.embeddings_float; // marengo3.x returns "float", 2.7 "embeddings_float"
  if (!vec) throw new Error('Twelve Labs embed returned no vector');
  return vec as number[];
}
