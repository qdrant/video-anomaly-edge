'use client';

import { useState } from 'react';
import { Incident, IncidentDetail, NeighborNormal, SimilarIncident } from '@/lib/types';
import { AnomalyTypeBadge, ConfidenceBadge, ScoringMethodBadge, ScoreBreakdown } from './HybridScoringUI';

interface ActiveIncidentCardProps {
  incident: Incident;
  detail: IncidentDetail | null;
  onConfirm: (incidentId: string, notes?: string) => void;
  onDismiss: (incidentId: string, notes?: string) => void;
  onJumpToTime: (timeMs: number) => void;
  onJumpToSimilar: (feedId: string, timeMs: number, incidentId: string) => void;
  onExportClip: (incidentId: string) => void;
}

type EvidenceTab = 'peak' | 'normal' | 'similar';

export default function ActiveIncidentCard({
  incident,
  detail,
  onConfirm,
  onDismiss,
  onJumpToTime,
  onJumpToSimilar,
  onExportClip,
}: ActiveIncidentCardProps) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>('peak');
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState<'true' | 'false' | 'unsure' | null>(null);

  // Evidence completeness
  const hasNeighbors = (incident.neighbors_normal?.length || 0) > 0;
  const hasSimilar = (detail?.neighbors_anomaly?.length || 0) > 0;
  const hasCaption = !!incident.label && incident.label !== 'Anomaly Detected';

  const handleConfirm = () => {
    onConfirm(incident.incident_id, notes || undefined);
    setNotes('');
    setResolution('true');
  };

  const handleDismiss = () => {
    onDismiss(incident.incident_id, notes || undefined);
    setNotes('');
    setResolution('false');
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-start gap-3">
          {/* Severity badge */}
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center font-mono ${
            incident.severity >= 70 ? 'bg-red-500/20 text-red-400' :
            incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-green-500/20 text-green-400'
          }`}>
            <span className="text-2xl font-bold">{incident.severity}</span>
            <span className="text-xs uppercase tracking-wide opacity-70">Severity</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white truncate">
                {incident.label || 'Anomaly Detected'}
              </h3>
              {incident.scoring_method && incident.scoring_method !== 'visual' && (
                <ScoringMethodBadge method={incident.scoring_method} />
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono">
              {formatTime(incident.feed_t_start_ms)} — {formatTime(incident.feed_t_end_ms)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Duration: {formatDuration(incident.feed_t_end_ms - incident.feed_t_start_ms)}
            </div>
          </div>
        </div>

        {/* Anomaly Type & Confidence */}
        {(incident.anomaly_type || incident.confidence) && (
          <div className="flex items-center justify-between mt-3">
            {incident.anomaly_type && (
              <AnomalyTypeBadge type={incident.anomaly_type} size="sm" />
            )}
            {incident.confidence && (
              <ConfidenceBadge level={incident.confidence} showLabel={true} />
            )}
          </div>
        )}

        {/* Score Breakdown (for hybrid scoring) */}
        {incident.visual_score !== undefined && (incident.description_boost || incident.temporal_boost) && (
          <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
            <ScoreBreakdown
              visualScore={incident.visual_score}
              descriptionBoost={incident.description_boost}
              temporalBoost={incident.temporal_boost}
              totalScore={incident.peak_score}
            />
          </div>
        )}

        {/* Tags */}
        {incident.tags && incident.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {incident.tags.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Evidence completeness */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          <StatusIndicator done={hasNeighbors} label="Neighbors" />
          <StatusIndicator done={hasSimilar} label="Similar" />
          <StatusIndicator done={hasCaption} label="Caption" pending={!hasCaption} />
          <StatusIndicator done={resolution !== null} label="Resolution" />
        </div>
      </div>

      {/* Evidence Tabs */}
      <div className="flex gap-1 p-2">
        <TabButton
          active={activeTab === 'peak'}
          onClick={() => setActiveTab('peak')}
          label="Peak Moments"
          count={incident.peak_windows?.length || 1}
        />
        <TabButton
          active={activeTab === 'normal'}
          onClick={() => setActiveTab('normal')}
          label="Normal Receipts"
          count={incident.neighbors_normal?.length || 0}
        />
        <TabButton
          active={activeTab === 'similar'}
          onClick={() => setActiveTab('similar')}
          label="Similar"
          count={detail?.neighbors_anomaly?.length || 0}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'peak' && (
          <PeakMomentsTab
            incident={incident}
            onJumpToTime={onJumpToTime}
          />
        )}
        {activeTab === 'normal' && (
          <NormalReceiptsTab
            neighbors={incident.neighbors_normal || []}
          />
        )}
        {activeTab === 'similar' && (
          <SimilarIncidentsTab
            similar={detail?.neighbors_anomaly || []}
            onJumpToSimilar={onJumpToSimilar}
          />
        )}
      </div>

      {/* Operator Actions */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-3">
        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes (optional)..."
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm placeholder-slate-500 resize-none focus:outline-none focus:border-slate-600"
          rows={2}
        />

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg font-medium text-sm transition-colors border border-green-500/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            True Incident
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium text-sm transition-colors border border-slate-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            False Alarm
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onExportClip(incident.incident_id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Clip
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save to Log
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function StatusIndicator({ done, label, pending }: { done: boolean; label: string; pending?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {done ? (
        <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : pending ? (
        <svg className="w-3.5 h-3.5 text-yellow-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
      )}
      <span className={done ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
        active
          ? 'bg-slate-800 text-white shadow-sm'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`ml-1 ${active ? 'text-blue-400' : 'text-slate-500'}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

function PeakMomentsTab({
  incident,
  onJumpToTime,
}: {
  incident: Incident;
  onJumpToTime: (timeMs: number) => void;
}) {
  // For now, show the incident window itself as the peak moment
  const peakWindows = incident.peak_windows || [{
    window_id: 'peak',
    time_ms: incident.feed_t_start_ms + (incident.feed_t_end_ms - incident.feed_t_start_ms) / 2,
    score: incident.peak_score,
  }];

  return (
    <div className="p-4 space-y-2">
      {peakWindows.map((window, i) => (
        <button
          key={i}
          onClick={() => onJumpToTime(window.time_ms)}
          className="w-full p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-left transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200 group-hover:text-white">
              Peak #{i + 1}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {formatTime(window.time_ms)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-500">
              Score: {(window.score * 100).toFixed(2)}%
            </span>
            <svg className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

function NormalReceiptsTab({ neighbors }: { neighbors: NeighborNormal[] }) {
  if (neighbors.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No normal references available
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        {neighbors.slice(0, 6).map((neighbor, i) => (
          <div
            key={i}
            className="aspect-video bg-slate-800 rounded-lg overflow-hidden relative group"
          >
            {neighbor.thumb_url ? (
              <img
                src={neighbor.thumb_url}
                alt={`Normal reference ${i + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{Math.round(neighbor.similarity * 100)}% match</span>
                {neighbor.same_scene && (
                  <span className="text-green-400">Same cam</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 text-center mt-3">
        These are the most similar normal moments from the baseline
      </p>
    </div>
  );
}

function SimilarIncidentsTab({
  similar,
  onJumpToSimilar,
}: {
  similar: SimilarIncident[];
  onJumpToSimilar: (feedId: string, timeMs: number, incidentId: string) => void;
}) {
  if (similar.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        No similar incidents found
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {similar.slice(0, 5).map((item) => (
        <button
          key={item.incident_id}
          onClick={() => onJumpToSimilar(item.feed_id, item.feed_t_start_ms, item.incident_id)}
          className="w-full p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-left transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">{item.feed_label}</span>
            <span className="text-xs text-blue-400">{Math.round(item.similarity * 100)}%</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-slate-500">
            <span className="font-mono">{formatTime(item.feed_t_start_ms)}</span>
            <span>Severity {item.severity}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// Helpers
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}
