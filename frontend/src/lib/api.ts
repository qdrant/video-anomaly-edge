import {
  VideoAnalysis,
  VideoSummary,
  HealthStatus,
  SearchResult,
  DatasetInfo,
  DatasetId,
  FeedsIndex,
  FeedManifest,
  IncidentsResponse,
  IncidentDetail,
  RunsResponse,
  Run,
  PRCurveResponse,
} from './types';

const API_BASE = '/api';

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/../health`);
  if (!res.ok) throw new Error('Failed to check health');
  return res.json();
}

export async function getDatasets(): Promise<DatasetInfo[]> {
  const res = await fetch(`${API_BASE}/datasets`);
  if (!res.ok) throw new Error('Failed to load datasets');
  return res.json();
}

export async function getTestVideos(dataset: DatasetId = 'shanghaitech'): Promise<VideoSummary[]> {
  const res = await fetch(`${API_BASE}/${dataset}/test-videos`);
  if (!res.ok) throw new Error('Failed to load videos');
  return res.json();
}

export async function getVideoResults(videoId: string, dataset: DatasetId = 'shanghaitech'): Promise<VideoAnalysis> {
  const res = await fetch(`${API_BASE}/${dataset}/results/${videoId}`);
  if (!res.ok) throw new Error('Failed to load results');
  return res.json();
}

export async function analyzeVideo(file: File): Promise<VideoAnalysis> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Analysis failed');
  return res.json();
}

export async function searchClips(
  query: string,
  options?: {
    anomaliesOnly?: boolean;
    scene?: string;
    limit?: number;
    dataset?: DatasetId;
  }
): Promise<SearchResult[]> {
  const dataset = options?.dataset ?? 'shanghaitech';
  const res = await fetch(`${API_BASE}/${dataset}/embeddings/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: options?.limit ?? 24,
      include_training: false,
    }),
  });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();

  const results: SearchResult[] = (data.results ?? [])
    .filter((r: any) => {
      if (options?.anomaliesOnly && !r.is_anomaly) return false;
      if (options?.scene && r.source_video !== options.scene) return false;
      return true;
    })
    .map((r: any) => ({
      clip_id: r.clip_id,
      scene_id: r.source_video ?? '',
      clip_index: r.clip_index ?? 0,
      start_time: r.start_time ?? 0,
      end_time: r.end_time ?? 0,
      anomaly_score: r.is_anomaly ? r.similarity : 0,
      is_anomaly: r.is_anomaly ?? false,
      thumbnail_url: r.thumbnail_url ?? '',
      match_score: r.similarity ?? 0,
      anomaly_type: r.anomaly_type || r.label || undefined,
      label: r.label || undefined,
      severity: r.severity || undefined,
    }));

  return results;
}

export async function findSimilarClips(
  sceneId: string,
  clipIndex: number,
  limit?: number,
  dataset: DatasetId = 'shanghaitech'
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  params.set('dataset', dataset);
  const url = `${API_BASE}/similar/${sceneId}/${clipIndex}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to find similar clips');
  return res.json();
}

export function getThumbnailUrl(videoType: string, clipId: string, dataset: DatasetId = 'shanghaitech'): string {
  return `${API_BASE}/${dataset}/thumbnails/${videoType}/${clipId}.jpg`;
}

export function getClipUrl(videoType: string, clipId: string, dataset: DatasetId = 'shanghaitech'): string {
  return `${API_BASE}/${dataset}/clips/${videoType}/${clipId}.mp4`;
}

export function getVideoUrl(videoType: string, videoId: string, dataset: DatasetId = 'shanghaitech'): string {
  return `${API_BASE}/${dataset}/videos/${videoType}/${videoId}`;
}

// ============================================================================
// Feed-based API (v2)
// ============================================================================

export async function getFeeds(dataset: DatasetId = 'shanghaitech'): Promise<FeedsIndex> {
  const res = await fetch(`${API_BASE}/${dataset}/feeds`);
  if (!res.ok) throw new Error('Failed to load feeds');
  return res.json();
}

export async function getFeed(feedId: string, dataset: DatasetId = 'shanghaitech'): Promise<FeedManifest> {
  const res = await fetch(`${API_BASE}/${dataset}/feeds/${feedId}`);
  if (!res.ok) throw new Error('Failed to load feed');
  return res.json();
}

export async function getIncidents(
  dataset: DatasetId = 'shanghaitech',
  options?: {
    runId?: string;
    feedId?: string;
    status?: string;
    minSeverity?: number;
    maxSeverity?: number;
    limit?: number;
    offset?: number;
  }
): Promise<IncidentsResponse> {
  const params = new URLSearchParams();
  if (options?.runId) params.set('run_id', options.runId);
  if (options?.feedId) params.set('feed_id', options.feedId);
  if (options?.status) params.set('status', options.status);
  if (options?.minSeverity !== undefined) params.set('min_severity', options.minSeverity.toString());
  if (options?.maxSeverity !== undefined) params.set('max_severity', options.maxSeverity.toString());
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const url = `${API_BASE}/${dataset}/incidents?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load incidents');
  return res.json();
}

export async function getIncident(
  incidentId: string,
  dataset: DatasetId = 'shanghaitech',
  runId: string = 'baseline'
): Promise<IncidentDetail> {
  const params = new URLSearchParams({ run_id: runId });
  const res = await fetch(`${API_BASE}/${dataset}/incidents/${incidentId}?${params}`);
  if (!res.ok) throw new Error('Failed to load incident');
  return res.json();
}

export async function updateIncidentStatus(
  incidentId: string,
  status: 'new' | 'confirmed' | 'false_alarm' | 'investigating',
  dataset: DatasetId = 'shanghaitech',
  runId: string = 'baseline'
): Promise<void> {
  const params = new URLSearchParams({ status, run_id: runId });
  const res = await fetch(`${API_BASE}/${dataset}/incidents/${incidentId}/status?${params}`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error('Failed to update incident status');
}

export async function getRuns(dataset: DatasetId = 'shanghaitech'): Promise<RunsResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/runs`);
  if (!res.ok) throw new Error('Failed to load runs');
  return res.json();
}

export async function getRun(runId: string, dataset: DatasetId = 'shanghaitech'): Promise<Run> {
  const res = await fetch(`${API_BASE}/${dataset}/runs/${runId}`);
  if (!res.ok) throw new Error('Failed to load run');
  return res.json();
}

export async function getPRCurve(dataset: DatasetId = 'shanghaitech'): Promise<PRCurveResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/pr-curve`);
  if (!res.ok) throw new Error('Failed to load PR curve');
  return res.json();
}

export async function evaluateThreshold(
  threshold: number,
  dataset: DatasetId = 'shanghaitech',
  cooldownMs: number = 0
): Promise<{
  threshold: number;
  cooldown_ms: number;
  metrics: {
    precision: number;
    recall: number;
    f1: number;
    false_alarm_rate: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    true_negatives: number;
  };
  incident_count: number;
}> {
  const res = await fetch(`${API_BASE}/${dataset}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threshold, cooldown_ms: cooldownMs }),
  });
  if (!res.ok) throw new Error('Failed to evaluate threshold');
  return res.json();
}

export const getIncidentDetail = getIncident;

// ============================================================================
// Intelligence API (Semantic Search & Latent Space)
// ============================================================================

export interface UMAPPoint {
  clip_id: string;
  source_video: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  x: number;
  y: number;
  is_training: boolean;
  is_anomaly: boolean | null;
}

export interface UMAPResponse {
  dataset_id: string;
  total_points: number;
  training_count: number;
  anomaly_count: number;
  points: UMAPPoint[];
}

export async function getUMAPProjections(dataset: DatasetId = 'shanghaitech'): Promise<UMAPResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/embeddings/umap`);
  if (!res.ok) throw new Error('Failed to load UMAP projections');
  return res.json();
}

export interface SemanticSearchResult {
  clip_id: string;
  source_video: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  similarity: number;
  is_anomaly: boolean;
  thumbnail_url: string;
  x?: number;
  y?: number;
}

export interface SemanticSearchResponse {
  query: string;
  results: SemanticSearchResult[];
  query_embedding_preview: number[];
}

export async function semanticSearch(
  query: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    limit?: number;
    includeTraining?: boolean;
  }
): Promise<SemanticSearchResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/embeddings/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: options?.limit ?? 20,
      include_training: options?.includeTraining ?? false,
    }),
  });
  if (!res.ok) throw new Error('Semantic search failed');
  return res.json();
}

export async function findSemanticallySimilarClips(
  clipId: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    limit?: number;
    includeTraining?: boolean;
  }
): Promise<SemanticSearchResult[]> {
  const res = await fetch(`${API_BASE}/${dataset}/embeddings/similar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clip_id: clipId,
      limit: options?.limit ?? 10,
      include_training: options?.includeTraining ?? true,
    }),
  });
  if (!res.ok) throw new Error('Similar search failed');
  return res.json();
}

export interface ExplainResponse {
  clip_id: string;
  explanation: string;
  model: string;
  prompt_used: string;
}

export async function explainClip(
  clipId: string,
  dataset: DatasetId = 'shanghaitech',
  prompt?: string
): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clip_id: clipId,
      prompt: prompt ?? 'Describe what is happening in this video segment.',
    }),
  });
  if (!res.ok) throw new Error('Explain failed');
  return res.json();
}

export interface ClipNeighborsResponse {
  clip_id: string;
  is_anomaly: boolean;
  neighbors: {
    clip_id: string;
    similarity: number;
    is_training: boolean;
    is_anomaly: boolean;
    thumbnail_url: string;
  }[];
}

export async function getClipNeighbors(
  clipId: string,
  dataset: DatasetId = 'shanghaitech',
  k: number = 5
): Promise<ClipNeighborsResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/clips/${clipId}/neighbors?k=${k}`);
  if (!res.ok) throw new Error('Failed to get neighbors');
  return res.json();
}

// ============================================================================
// Pegasus Q&A and Report API
// ============================================================================

export interface DatasetContext {
  dataset_id: string;
  name: string;
  scene_description: string;
  normal_behavior: string;
  anomaly_types: string[];
  example_anomalies: string;
  supported_datasets: string[];
}

export async function getDatasetContext(dataset: DatasetId = 'shanghaitech'): Promise<DatasetContext> {
  const res = await fetch(`${API_BASE}/${dataset}/context`);
  if (!res.ok) throw new Error('Failed to load dataset context');
  return res.json();
}

export interface ClipQAResponse {
  clip_id: string;
  question: string;
  answer: string;
  confidence: string;
  evidence_timestamps: Record<string, unknown>[];
  latency_ms: number;
}

export async function askClipQuestion(
  clipId: string,
  question: string,
  dataset: DatasetId = 'shanghaitech'
): Promise<ClipQAResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/qa/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clip_id: clipId, question }),
  });
  if (!res.ok) throw new Error('Q&A failed');
  return res.json();
}

export interface VideoQAResponse {
  video_id: string;
  question: string;
  answer: string;
  relevant_clips: {
    clip_id: string;
    description: string;
    start_time: number;
    anomaly_type: string | null;
    relevance: number;
  }[];
  latency_ms: number;
  confidence: string;
}

export async function askVideoQuestion(
  videoId: string,
  question: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    searchDescriptions?: boolean;
    maxClips?: number;
  }
): Promise<VideoQAResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/qa/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: videoId,
      question,
      search_descriptions: options?.searchDescriptions ?? true,
      max_clips: options?.maxClips ?? 5,
    }),
  });
  if (!res.ok) throw new Error('Video Q&A failed');
  return res.json();
}

export interface DescriptionResponse {
  clip_id: string;
  description: string;
  anomaly_type: string | null;
  subjects: string[];
  actions: string[];
  confidence: string;
  latency_ms: number;
}

export async function generateDescription(
  clipId: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    isAnomaly?: boolean;
    anomalyScore?: number;
  }
): Promise<DescriptionResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/describe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clip_id: clipId,
      is_anomaly: options?.isAnomaly ?? false,
      anomaly_score: options?.anomalyScore ?? 0,
    }),
  });
  if (!res.ok) throw new Error('Description generation failed');
  return res.json();
}

export interface VideoReportResponse {
  video_id: string;
  dataset_id: string;
  summary: string;
  total_duration_sec: number;
  segment_count: number;
  anomaly_count: number;
  timeline: {
    start_sec: number;
    end_sec: number;
    description: string;
    is_anomaly: boolean;
    severity: number;
  }[];
  key_events: {
    time_sec: number;
    description: string;
    severity: number;
  }[];
  dataset_context: DatasetContext;
}

export async function generateVideoReport(
  videoId: string,
  dataset: DatasetId = 'shanghaitech',
  includeDescriptions: boolean = true
): Promise<VideoReportResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: videoId,
      include_descriptions: includeDescriptions,
    }),
  });
  if (!res.ok) throw new Error('Report generation failed');
  return res.json();
}

export interface TextSearchResult {
  clip_id: string;
  description: string;
  anomaly_type: string | null;
  start_time: number;
  end_time: number;
  source_video: string;
  thumbnail_url: string;
}

export interface TextSearchResponse {
  query: string;
  results: TextSearchResult[];
  total_matches: number;
}

export async function searchDescriptions(
  query: string,
  dataset: DatasetId = 'shanghaitech',
  limit: number = 20
): Promise<TextSearchResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/search/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) throw new Error('Text search failed');
  return res.json();
}

// ============================================================================
// Fusion Search API (Visual + Semantic)
// ============================================================================

export interface FusionSearchResult {
  clip_id: string;
  source_video: string;
  start_time: number;
  end_time: number;
  thumbnail_url: string;
  description: string;
  anomaly_type: string | null;
  clip_score: number;
  desc_score: number;
  fused_score: number;
  clip_rank: number;
  desc_rank: number;
}

export interface FusionSearchResponse {
  query: string;
  fusion_method: string;
  results: FusionSearchResult[];
  visual_only_count: number;
  semantic_only_count: number;
  overlap_count: number;
}

export async function fusionSearch(
  query: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    limit?: number;
    sceneId?: string;
    fusionMethod?: 'rrf' | 'score_avg';
  }
): Promise<FusionSearchResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/search/fusion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: options?.limit ?? 20,
      scene_id: options?.sceneId,
      fusion_method: options?.fusionMethod ?? 'rrf',
    }),
  });
  if (!res.ok) throw new Error('Fusion search failed');
  return res.json();
}

export interface DualAnomalyResponse {
  clip_id: string;
  visual_score: number;
  semantic_score: number;
  fused_score: number;
  fusion_method: string;
  is_anomaly: boolean;
  threshold_used: number;
  visual_neighbors: Array<{
    clip_id: string;
    similarity: number;
    thumbnail_url: string;
  }>;
  semantic_neighbors: Array<{
    clip_id: string;
    similarity: number;
    description: string;
  }>;
}

export async function getDualAnomalyScore(
  clipId: string,
  dataset: DatasetId = 'shanghaitech',
  options?: {
    visualWeight?: number;
    semanticWeight?: number;
    fusionMethod?: 'max' | 'weighted' | 'min';
    kNeighbors?: number;
  }
): Promise<DualAnomalyResponse> {
  const res = await fetch(`${API_BASE}/${dataset}/anomaly/dual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clip_id: clipId,
      visual_weight: options?.visualWeight ?? 0.6,
      semantic_weight: options?.semanticWeight ?? 0.4,
      fusion_method: options?.fusionMethod ?? 'weighted',
      k_neighbors: options?.kNeighbors ?? 3,
    }),
  });
  if (!res.ok) throw new Error('Dual anomaly scoring failed');
  return res.json();
}

export async function findSimilarByDescription(
  description: string,
  dataset: DatasetId = 'shanghaitech',
  limit: number = 10
): Promise<{
  query_description: string;
  results: Array<{
    clip_id: string;
    description: string;
    anomaly_type: string | null;
    source_video: string;
    thumbnail_url: string;
  }>;
  count: number;
}> {
  const res = await fetch(`${API_BASE}/${dataset}/similar/description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, limit }),
  });
  if (!res.ok) throw new Error('Similar description search failed');
  return res.json();
}

export async function getClipVectors(
  clipId: string,
  dataset: DatasetId = 'shanghaitech'
): Promise<{
  clip_id: string;
  has_v_clip: boolean;
  has_v_desc: boolean;
  v_desc_populated: boolean;
  v_clip_sample_norm: number;
  v_desc_sample_norm: number;
  description: string;
  anomaly_type: string | null;
  has_desc_embedding: boolean;
}> {
  const res = await fetch(`${API_BASE}/${dataset}/vectors/${clipId}`);
  if (!res.ok) throw new Error('Failed to get clip vectors');
  return res.json();
}

// ============================================================================
// Chat API - Query corpus with natural language
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatClipMatch {
  clip_id: string;
  dataset_id: string;
  description: string;
  is_anomaly: boolean;
  anomaly_type: string | null;
  anomaly_score: number;
  relevance_score: number;
}

export interface ChatResponse {
  answer: string;
  matches: ChatClipMatch[];
  query_type: 'corpus' | 'dataset' | 'clip';
}

export interface CorpusStats {
  total_clips: number;
  total_anomalies: number;
  datasets: Record<string, {
    clips: number;
    anomalies: number;
    anomaly_types: string[];
  }>;
}

export async function chatWithCorpus(
  message: string,
  options?: {
    dataset?: string;
    clipId?: string;
    history?: ChatMessage[];
  }
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      dataset: options?.dataset,
      clip_id: options?.clipId,
      history: options?.history ?? [],
    }),
  });
  if (!res.ok) throw new Error('Chat request failed');
  return res.json();
}

export async function getCorpusStats(): Promise<CorpusStats> {
  const res = await fetch(`${API_BASE}/chat/stats`);
  if (!res.ok) throw new Error('Failed to get corpus stats');
  return res.json();
}

export async function getCorpusClip(clipId: string): Promise<ChatClipMatch & {
  source_video: string;
  subjects: string[];
  actions: string[];
  confidence: string;
}> {
  const res = await fetch(`${API_BASE}/chat/clip/${clipId}`);
  if (!res.ok) throw new Error('Failed to get clip info');
  return res.json();
}

export interface ChatVideoQAResponse {
  answer: string;
  source: 'twelvelabs' | 'corpus';
  clip_id?: string;
  confidence: string;
}

export async function chatWithVideo(
  question: string,
  dataset: DatasetId = 'shanghaitech',
  feedId?: string,
  timeMs?: number
): Promise<ChatVideoQAResponse> {
  const res = await fetch(`${API_BASE}/chat/video-qa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      dataset,
      feed_id: feedId,
      time_ms: timeMs,
    }),
  });
  if (!res.ok) throw new Error('Video Q&A failed');
  return res.json();
}

export async function getChatStatus(): Promise<{
  pegasus_available: boolean;
  corpus_loaded: boolean;
  corpus_clips: number;
  capabilities: string[];
}> {
  const res = await fetch(`${API_BASE}/chat/status`);
  if (!res.ok) throw new Error('Failed to get chat status');
  return res.json();
}
