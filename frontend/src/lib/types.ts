export interface Neighbor {
  clip_id: string;
  similarity: number;
  source_video: string;
  thumbnail_url: string;
}

export interface ClipResult {
  clip_id: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  anomaly_score: number;
  is_anomaly: boolean;
  neighbors: Neighbor[];
  thumbnail_url: string;
  visual_score?: number;
  description_boost?: number;
  temporal_boost?: number;
  scoring_method?: ScoringMethod;
  anomaly_type?: AnomalyType;
  confidence?: ConfidenceLevel;
  scene_id?: string;
}

export type ScoringMethod = 'visual' | 'hybrid' | 'multimodal' | 'multimodal+hybrid';
export type AnomalyType = 'running' | 'throwing' | 'loitering' | 'wrong_direction' | 'unusual_gesture' | 'other' | null;
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface VideoAnalysis {
  video_id: string;
  total_clips: number;
  anomaly_count: number;
  clips: ClipResult[];
}

export interface VideoSummary {
  id: string;
  name: string;
  thumbnail_url: string;
  anomaly_count: number;
  total_clips: number;
}

export interface HealthStatus {
  status: string;
  qdrant_connected: boolean;
  collection_points: number;
  training_embeddings: number;
  testing_embeddings: number;
}

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  video_count: number;
  anomaly_count: number;
}

export type DatasetId = 'avenue' | 'streetscene' | 'ucsd_ped1' | 'ucsd_ped2' | 'umn' | 'shanghaitech' | 'ucf' | 'ucf_crime';

export interface SearchResult {
  clip_id: string;
  scene_id: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  anomaly_score: number;
  is_anomaly: boolean;
  thumbnail_url: string;
  match_score: number;
  anomaly_type?: string;
  label?: string;
  severity?: number;
}

// ============================================================================
// Feed-based Types (v2)
// ============================================================================

export interface FeedSummary {
  feed_id: string;
  label: string;
  duration_ms: number;
  segment_count: number;
  incident_count: number;
  top_severity: number;
  density_data: number[];
  scene_id?: string;
  last_incident_time?: string;
}

export interface FeedsIndex {
  dataset_id: string;
  dataset_name: string;
  feed_count: number;
  total_duration_ms: number;
  feeds: FeedSummary[];
}

export interface Segment {
  segment_id: string;
  src_url: string;
  feed_start_ms: number;
  duration_ms: number;
  thumb_url: string;
}

export interface Window {
  window_id: string;
  feed_t_start_ms: number;
  feed_t_end_ms: number;
  severity: number;
  is_anomaly: boolean;
  neighbors_normal: NeighborNormal[];
  visual_score?: number;
  description_boost?: number;
  temporal_boost?: number;
  scoring_method?: ScoringMethod;
  anomaly_type?: AnomalyType;
  confidence?: ConfidenceLevel;
}

export interface NeighborNormal {
  clip_id: string;
  similarity: number;
  thumb_url: string;
  same_scene?: boolean;
  time_bucket?: string;
}

export interface FeedManifest {
  feed_id: string;
  dataset_id: string;
  label: string;
  duration_ms: number;
  fps: number;
  segment_count: number;
  segments: Segment[];
  windows: Window[];
}

export interface PeakWindow {
  window_id: string;
  time_ms: number;
  score: number;
}

export interface Incident {
  incident_id: string;
  feed_id: string;
  feed_t_start_ms: number;
  feed_t_end_ms: number;
  duration_ms: number;
  severity: number;
  peak_score: number;
  status: 'new' | 'confirmed' | 'false_alarm' | 'investigating';
  label?: string;
  tags?: string[];
  windows: string[];
  peak_windows?: PeakWindow[];
  neighbors_normal: NeighborNormal[];
  visual_score?: number;
  description_boost?: number;
  temporal_boost?: number;
  scoring_method?: ScoringMethod;
  anomaly_type?: AnomalyType;
  confidence?: ConfidenceLevel;
}

export interface SimilarIncident {
  incident_id: string;
  feed_id: string;
  feed_label: string;
  feed_t_start_ms: number;
  feed_t_end_ms: number;
  severity: number;
  similarity: number;
}

export interface IncidentDetail extends Incident {
  feed_label: string;
  neighbors_anomaly: SimilarIncident[];
}

export interface IncidentsResponse {
  dataset_id: string;
  run_id: string;
  threshold: number;
  incident_count: number;
  incidents: Incident[];
}

export interface RunMetrics {
  precision: number;
  recall: number;
  f1: number;
  false_alarm_rate: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
}

export interface RunParams {
  threshold: number;
  k_neighbors: number;
  window_size_ms: number;
  stride_ms: number;
  cooldown_ms: number;
  model: string;
}

export interface Run {
  run_id: string;
  name: string;
  is_default: boolean;
  params: RunParams;
  metrics: RunMetrics;
}

export interface RunsResponse {
  dataset_id: string;
  runs: Run[];
}

export interface PRCurvePoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface PRCurveResponse {
  dataset_id: string;
  points: PRCurvePoint[];
}
