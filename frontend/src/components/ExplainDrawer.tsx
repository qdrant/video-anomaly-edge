'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { IncidentDetail, NeighborNormal, SimilarIncident, DatasetId } from '@/lib/types';
import { getIncident, updateIncidentStatus } from '@/lib/api';
import { AnomalyTypeBadge, ConfidenceBadge, ScoringMethodBadge, ScoreBreakdown } from './HybridScoringUI';

interface ExplainDrawerProps {
  incidentId: string | null;
  dataset: DatasetId;
  runId?: string;
  onClose: () => void;
  onJumpToIncident?: (feedId: string, timeMs: number, incidentId: string) => void;
  onStatusChange?: () => void;
}

type TabId = 'similar' | 'normal' | 'evidence';

export default function ExplainDrawer({
  incidentId,
  dataset,
  runId = 'baseline',
  onClose,
  onJumpToIncident,
  onStatusChange,
}: ExplainDrawerProps) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('similar'); // Similar Incidents is PRIMARY
  const [updating, setUpdating] = useState(false);

  // Load incident detail
  useEffect(() => {
    if (!incidentId) {
      setIncident(null);
      return;
    }

    async function loadIncident() {
      setLoading(true);
      try {
        const data = await getIncident(incidentId!, dataset, runId);
        setIncident(data);
      } catch (err) {
        console.error('Failed to load incident:', err);
      } finally {
        setLoading(false);
      }
    }
    loadIncident();
  }, [incidentId, dataset, runId]);

  // Handle status update
  const handleStatusUpdate = async (status: 'confirmed' | 'false_alarm' | 'investigating') => {
    if (!incident) return;
    setUpdating(true);
    try {
      await updateIncidentStatus(incident.incident_id, status, dataset, runId);
      setIncident({ ...incident, status });
      onStatusChange?.();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Handle click on similar incident
  const handleSimilarIncidentClick = (similar: SimilarIncident) => {
    onJumpToIncident?.(similar.feed_id, similar.feed_t_start_ms, similar.incident_id);
  };

  const isOpen = !!incidentId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Drawer - no blocking backdrop, slides in from right */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 z-50 flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.5)]"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Explain Incident</h2>
                {incident && (
                  <p className="text-sm text-slate-400">{incident.feed_label}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-red-500 rounded-full animate-spin" />
              </div>
            ) : incident ? (
              <>
                {/* Incident Summary */}
                <div className="p-4 border-b border-slate-800 bg-slate-800/30">
                  <div className="flex items-center gap-4">
                    {/* Severity */}
                    <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center ${
                      incident.severity >= 70 ? 'bg-red-500/20' :
                      incident.severity >= 40 ? 'bg-yellow-500/20' :
                      'bg-green-500/20'
                    }`}>
                      <span className={`text-2xl font-mono font-bold ${
                        incident.severity >= 70 ? 'text-red-400' :
                        incident.severity >= 40 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {incident.severity}
                      </span>
                      <span className="text-xs text-slate-400 uppercase">Severity</span>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{incident.label || 'Anomaly Detected'}</span>
                        {incident.scoring_method && incident.scoring_method !== 'visual' && (
                          <ScoringMethodBadge method={incident.scoring_method} />
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatTime(incident.feed_t_start_ms)} - {formatTime(incident.feed_t_end_ms)}
                      </div>
                    </div>

                    {/* Status */}
                    <StatusBadge status={incident.status} />
                  </div>

                  {/* Anomaly Type & Confidence */}
                  {(incident.anomaly_type || incident.confidence) && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                      {incident.anomaly_type && (
                        <AnomalyTypeBadge type={incident.anomaly_type} size="sm" />
                      )}
                      {incident.confidence && (
                        <ConfidenceBadge level={incident.confidence} showLabel={true} />
                      )}
                    </div>
                  )}
                </div>

                {/* Tabs - Similar Incidents is FIRST (most important) */}
                <div className="flex gap-1 p-2">
                  <TabButton
                    active={activeTab === 'similar'}
                    onClick={() => setActiveTab('similar')}
                    label="Similar Incidents"
                    count={incident.neighbors_anomaly?.length ?? 0}
                    highlight
                  />
                  <TabButton
                    active={activeTab === 'normal'}
                    onClick={() => setActiveTab('normal')}
                    label="Nearest Normal"
                    count={incident.neighbors_normal?.length ?? 0}
                  />
                  <TabButton
                    active={activeTab === 'evidence'}
                    onClick={() => setActiveTab('evidence')}
                    label="Evidence"
                  />
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === 'similar' && (
                    <SimilarIncidentsTab
                      incidents={incident.neighbors_anomaly ?? []}
                      onIncidentClick={handleSimilarIncidentClick}
                    />
                  )}
                  {activeTab === 'normal' && (
                    <NearestNormalTab neighbors={incident.neighbors_normal ?? []} />
                  )}
                  {activeTab === 'evidence' && (
                    <EvidenceTab incident={incident} />
                  )}
                </div>

                {/* Actions */}
                {(incident.status === 'new' || incident.status === 'investigating') && (
                  <div className="p-4 border-t border-slate-800 space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStatusUpdate('confirmed')}
                        disabled={updating}
                        className="flex-1 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/25 hover:border-red-500/40 disabled:opacity-50 rounded-lg font-medium transition-all text-sm"
                      >
                        Escalate
                      </button>
                      {incident.status === 'new' && (
                        <button
                          onClick={() => handleStatusUpdate('investigating')}
                          disabled={updating}
                          className="flex-1 py-2 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/25 hover:border-yellow-500/40 disabled:opacity-50 rounded-lg font-medium transition-all text-sm"
                        >
                          Investigate
                        </button>
                      )}
                      <button
                        onClick={() => handleStatusUpdate('false_alarm')}
                        disabled={updating}
                        className="flex-1 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/25 hover:border-green-500/40 disabled:opacity-50 rounded-lg font-medium transition-all text-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Select an incident
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Similar Incidents Tab - THE QDRANT WOW MOMENT
function SimilarIncidentsTab({
  incidents,
  onIncidentClick,
}: {
  incidents: SimilarIncident[];
  onIncidentClick: (incident: SimilarIncident) => void;
}) {
  if (incidents.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-slate-500 mb-2">No similar incidents found</div>
        <p className="text-xs text-slate-600">This might be a unique event</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Similar Incidents
        </div>
        <p className="text-xs text-slate-400 mt-1">
          These incidents share similar visual patterns with the current anomaly.
        </p>
      </div>

      <div className="space-y-2">
        {incidents.map((inc, i) => (
          <button
            key={inc.incident_id}
            onClick={() => onIncidentClick(inc)}
            className="w-full flex items-center gap-3 p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-left"
          >
            {/* Rank */}
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-mono">
              {i + 1}
            </div>

            {/* Severity */}
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm ${
              inc.severity >= 70 ? 'bg-red-500/20 text-red-400' :
              inc.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-green-500/20 text-green-400'
            }`}>
              {inc.severity}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{inc.feed_label}</div>
              <div className="text-xs text-slate-400">
                {formatTime(inc.feed_t_start_ms)}
              </div>
            </div>

            {/* Similarity */}
            <div className="text-right">
              <div className="text-sm font-mono text-green-400">{inc.similarity}%</div>
              <div className="text-xs text-slate-500">match</div>
            </div>

            {/* Arrow */}
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-4 text-center">
        Click any incident to jump to it
      </p>
    </div>
  );
}

// Nearest Normal Tab
function NearestNormalTab({ neighbors }: { neighbors: NeighborNormal[] }) {
  if (neighbors.length === 0) {
    return (
      <div className="text-center text-slate-500 py-8">
        No normal neighbors found
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-400 mb-4">
        These training clips are most similar to the anomaly. The difference reveals what makes this moment unusual.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {neighbors.map((neighbor) => (
          <div key={neighbor.clip_id} className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="relative aspect-video bg-slate-700">
              <Image
                src={neighbor.thumb_url}
                alt={neighbor.clip_id}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs font-mono">
                {neighbor.similarity.toFixed(1)}%
              </div>
            </div>
            <div className="p-2">
              <div className="text-xs text-slate-400 truncate">{neighbor.clip_id}</div>
              <div className="text-xs text-green-400">Normal</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Evidence Tab
function EvidenceTab({ incident }: { incident: IncidentDetail }) {
  const hasHybridScoring = incident.visual_score !== undefined &&
    (incident.description_boost || incident.temporal_boost);

  return (
    <div className="space-y-4">
      {/* Score Breakdown (for hybrid scoring) */}
      {hasHybridScoring && (
        <div className="p-4 bg-slate-800 rounded-lg">
          <div className="text-sm font-medium mb-3">Score Breakdown</div>
          <ScoreBreakdown
            visualScore={incident.visual_score}
            descriptionBoost={incident.description_boost}
            temporalBoost={incident.temporal_boost}
            totalScore={incident.peak_score}
          />
        </div>
      )}

      {/* Why Flagged */}
      <div className="p-4 bg-slate-800 rounded-lg">
        <div className="text-sm font-medium mb-2">Why Was This Flagged?</div>
        <div className="space-y-2 text-sm text-slate-400">
          <p>
            This clip was flagged because its visual embedding differs significantly from
            baseline training data.
          </p>
          {incident.anomaly_type && incident.anomaly_type !== 'other' && (
            <p>
              <span className="text-white">Detected behavior:</span>{' '}
              <span className="capitalize">{incident.anomaly_type.replace('_', ' ')}</span>
            </p>
          )}
          {incident.description_boost && incident.description_boost > 0 && (
            <p>
              <span className="text-cyan-400">+{(incident.description_boost * 100).toFixed(1)}%</span>{' '}
              boost from scene description analysis
            </p>
          )}
          {incident.temporal_boost && incident.temporal_boost > 0 && (
            <p>
              <span className="text-violet-400">+{(incident.temporal_boost * 100).toFixed(1)}%</span>{' '}
              boost from consecutive anomalous clips
            </p>
          )}
          <p>
            Average similarity to normal clips:{' '}
            <span className="font-mono text-white">
              {incident.neighbors_normal && incident.neighbors_normal.length > 0
                ? (incident.neighbors_normal.reduce((a, b) => a + b.similarity, 0) / incident.neighbors_normal.length).toFixed(1)
                : 'N/A'}%
            </span>
          </p>
        </div>
      </div>

      {/* Detection Method */}
      {incident.scoring_method && incident.scoring_method !== 'visual' && (
        <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-400 mb-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Hybrid Detection
          </div>
          <p className="text-xs text-slate-400">
            This incident was detected using {incident.scoring_method === 'multimodal+hybrid'
              ? 'multimodal visual+description embeddings with semantic boosting'
              : incident.scoring_method === 'multimodal'
                ? 'multimodal visual+description embeddings'
                : 'visual similarity with semantic boosting'
            }.
          </p>
        </div>
      )}

      <div className="p-4 bg-slate-800 rounded-lg">
        <div className="text-sm font-medium mb-2">Windows</div>
        <div className="flex flex-wrap gap-2">
          {incident.windows.map(w => (
            <span key={w} className="px-2 py-1 bg-slate-700 rounded text-xs">{w}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function TabButton({
  active,
  onClick,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
        active ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
          highlight && active ? 'bg-blue-500/30 text-blue-300' : active ? 'bg-slate-700' : 'bg-slate-800'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-orange-500/20 text-orange-400',
    investigating: 'bg-yellow-500/20 text-yellow-400',
    confirmed: 'bg-red-500/20 text-red-400',
    false_alarm: 'bg-green-500/20 text-green-400',
  };
  const labels: Record<string, string> = {
    new: 'New',
    investigating: 'Needs Investigation',
    confirmed: 'Escalated',
    false_alarm: 'False Alarm',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.new}`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
}

function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}:${s.toString().padStart(2, '0')}`;
}
