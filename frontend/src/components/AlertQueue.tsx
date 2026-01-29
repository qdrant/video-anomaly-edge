'use client';

import { useMemo } from 'react';
import { Incident } from '@/lib/types';
import { AnomalyTypeBadge } from './HybridScoringUI';

interface AlertQueueProps {
  incidents: Incident[];
  currentIncidentId: string | null;
  currentTimeMs: number;
  onIncidentClick: (incident: Incident) => void;
  onConfirm: (incidentId: string) => void;
  onDismiss: (incidentId: string) => void;
}

export default function AlertQueue({
  incidents,
  currentIncidentId,
  currentTimeMs,
  onIncidentClick,
  onConfirm,
  onDismiss,
}: AlertQueueProps) {
  // Sort by urgency: new items first, then by severity
  const sortedIncidents = useMemo(() => {
    return [...incidents].sort((a, b) => {
      // New items first
      if (a.status === 'new' && b.status !== 'new') return -1;
      if (b.status === 'new' && a.status !== 'new') return 1;
      // Then by severity
      return b.severity - a.severity;
    });
  }, [incidents]);

  const newCount = incidents.filter(i => i.status === 'new').length;
  const nextUp = sortedIncidents.find(i => i.status === 'new');

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const getUrgencyLabel = (incident: Incident) => {
    if (incident.status === 'confirmed') return { label: 'Confirmed', color: 'bg-red-500/20 text-red-400' };
    if (incident.status === 'false_alarm') return { label: 'Dismissed', color: 'bg-slate-500/20 text-slate-400' };
    if (incident.severity >= 80) return { label: 'Escalate', color: 'bg-red-500 text-white' };
    if (incident.severity >= 50) return { label: 'Needs Review', color: 'bg-yellow-500/20 text-yellow-400' };
    return { label: 'Low Priority', color: 'bg-slate-600/50 text-slate-300' };
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              Alert Queue
              {newCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-mono animate-pulse">
                  {newCount}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {newCount > 0 ? `${newCount} awaiting review` : 'All clear'}
            </p>
          </div>
          {/* Keyboard hints */}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">N</kbd>
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">P</kbd>
          </div>
        </div>
      </div>

      {/* Next Up Banner */}
      {nextUp && (
        <div
          className="mx-3 mt-3 p-3 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-lg cursor-pointer hover:border-red-500/50 transition-colors"
          onClick={() => onIncidentClick(nextUp)}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Next Up</span>
            <span className="text-xs text-slate-400 font-mono">{formatTime(nextUp.feed_t_start_ms)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold ${
              nextUp.severity >= 70 ? 'bg-red-500/30 text-red-300' :
              nextUp.severity >= 40 ? 'bg-yellow-500/30 text-yellow-300' :
              'bg-green-500/30 text-green-300'
            }`}>
              {nextUp.severity}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {nextUp.label || `Anomaly detected`}
              </div>
              {nextUp.anomaly_type && (
                <div className="mt-1">
                  <AnomalyTypeBadge type={nextUp.anomaly_type} size="xs" />
                </div>
              )}
              <div className="text-xs text-slate-400">
                Severity {nextUp.severity} &middot; {Math.round((nextUp.feed_t_end_ms - nextUp.feed_t_start_ms) / 1000)}s
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedIncidents.map((incident, idx) => {
          const isActive = currentTimeMs >= incident.feed_t_start_ms && currentTimeMs < incident.feed_t_end_ms;
          const isSelected = incident.incident_id === currentIncidentId;
          const urgency = getUrgencyLabel(incident);
          const isNextUp = incident === nextUp;

          if (isNextUp) return null; // Already shown above

          return (
            <div
              key={incident.incident_id}
              onClick={() => onIncidentClick(incident)}
              className={`group p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-800 border border-slate-600 ring-1 ring-slate-500/50'
                  : isActive
                    ? 'bg-slate-800/70 border border-slate-700'
                    : 'bg-slate-900/50 hover:bg-slate-800/50 border border-transparent hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Severity Badge */}
                <div className={`w-9 h-9 rounded flex items-center justify-center font-mono text-sm font-bold flex-shrink-0 ${
                  incident.severity >= 70 ? 'bg-red-500/20 text-red-400' :
                  incident.severity >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {incident.severity}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">
                      {formatTime(incident.feed_t_start_ms)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${urgency.color}`}>
                      {urgency.label}
                    </span>
                  </div>
                  <div className="text-sm font-medium mt-1 truncate">
                    {incident.label || `Incident #${idx + 1}`}
                  </div>
                  {incident.anomaly_type && (
                    <div className="mt-1">
                      <AnomalyTypeBadge type={incident.anomaly_type} size="xs" />
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions (shown on hover for new items) */}
              {incident.status === 'new' && (
                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onConfirm(incident.incident_id); }}
                    className="flex-1 px-2 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(incident.incident_id); }}
                    className="flex-1 px-2 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {incidents.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="font-medium">All Clear</div>
            <p className="text-xs text-slate-600 mt-1">No incidents detected</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{incidents.filter(i => i.status === 'confirmed').length} confirmed</span>
          <span>{incidents.filter(i => i.status === 'false_alarm').length} dismissed</span>
        </div>
      </div>
    </div>
  );
}
