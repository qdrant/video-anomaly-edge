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
