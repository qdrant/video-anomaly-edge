'use client';

import { useState, useRef, useCallback } from 'react';
import { FeedManifest, Window, Incident } from '@/lib/types';

interface FeedTimelineProps {
  feed: FeedManifest;
  incidents?: Incident[];
  currentTimeMs: number;
  onSeek: (timeMs: number) => void;
  onIncidentClick?: (incident: Incident) => void;
  zoomLevel?: 'full' | '5m' | '1m' | '30s';
}

export default function FeedTimeline({
  feed,
  incidents = [],
  currentTimeMs,
  onSeek,
  onIncidentClick,
  zoomLevel = 'full',
}: FeedTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<Window | null>(null);

  // Calculate visible range based on zoom level
  const getVisibleRange = useCallback((): { start: number; end: number } => {
    const zoomDurations: Record<string, number> = {
      'full': feed.duration_ms,
      '5m': 5 * 60 * 1000,
      '1m': 60 * 1000,
      '30s': 30 * 1000,
    };
    const visibleDuration = zoomDurations[zoomLevel] || feed.duration_ms;

    if (zoomLevel === 'full') {
      return { start: 0, end: feed.duration_ms };
    }

    // Center on current time
    const halfDuration = visibleDuration / 2;
    let start = currentTimeMs - halfDuration;
    let end = currentTimeMs + halfDuration;

    // Clamp to feed bounds
    if (start < 0) {
      start = 0;
      end = Math.min(visibleDuration, feed.duration_ms);
    }
    if (end > feed.duration_ms) {
      end = feed.duration_ms;
      start = Math.max(0, feed.duration_ms - visibleDuration);
    }

    return { start, end };
  }, [feed.duration_ms, currentTimeMs, zoomLevel]);

  const { start: visibleStart, end: visibleEnd } = getVisibleRange();
  const visibleDuration = visibleEnd - visibleStart;

  // Convert time to percentage position
  const timeToPercent = (timeMs: number): number => {
    return ((timeMs - visibleStart) / visibleDuration) * 100;
  };

  // Handle click on timeline
  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const targetTime = visibleStart + pct * visibleDuration;
    onSeek(Math.max(0, Math.min(targetTime, feed.duration_ms)));
  };

  // Handle mouse move for hover tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = visibleStart + pct * visibleDuration;
    setHoveredTime(time);

    // Find window at this time
    const window = feed.windows.find(w =>
      time >= w.feed_t_start_ms && time < w.feed_t_end_ms
    );
    setHoveredWindow(window || null);
  };

  // Format time for display
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get severity color
  const getSeverityColor = (severity: number): string => {
    if (severity >= 70) return 'bg-red-500';
    if (severity >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Filter visible windows and incidents
  const visibleWindows = feed.windows.filter(w =>
    w.feed_t_end_ms > visibleStart && w.feed_t_start_ms < visibleEnd
  );

  const visibleIncidents = incidents.filter(i =>
    i.feed_t_end_ms > visibleStart && i.feed_t_start_ms < visibleEnd
  );

  return (
    <div className="bg-slate-900 rounded-lg p-4">
      {/* Timeline container */}
      <div
        ref={containerRef}
        className="relative h-24 cursor-pointer"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredTime(null); setHoveredWindow(null); }}
      >
        {/* Severity bars track */}
        <div className="absolute inset-x-0 top-0 h-12 flex items-end">
          {visibleWindows.map((window) => {
            const leftPct = Math.max(0, timeToPercent(window.feed_t_start_ms));
            const rightPct = Math.min(100, timeToPercent(window.feed_t_end_ms));
            const widthPct = rightPct - leftPct;
            const heightPct = Math.max(10, (window.severity / 100) * 100);

            return (
              <div
                key={window.window_id}
                className={`absolute bottom-0 ${
                  window.is_anomaly ? getSeverityColor(window.severity) : 'bg-slate-600'
                } opacity-80 hover:opacity-100 transition-opacity`}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0.5)}%`,
                  height: `${heightPct}%`,
                }}
              />
            );
          })}
        </div>

        {/* Incident blocks track */}
        <div className="absolute inset-x-0 bottom-6 h-6">
          {visibleIncidents.map((incident) => {
            const leftPct = Math.max(0, timeToPercent(incident.feed_t_start_ms));
            const rightPct = Math.min(100, timeToPercent(incident.feed_t_end_ms));
            const widthPct = rightPct - leftPct;

            return (
              <button
                key={incident.incident_id}
                className={`absolute h-full rounded ${
                  incident.status === 'confirmed' ? 'bg-red-500' :
                  incident.status === 'false_alarm' ? 'bg-slate-500' :
                  'bg-red-500/70'
                } hover:ring-2 hover:ring-white transition-all`}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 1)}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onIncidentClick?.(incident);
                }}
                title={`Incident: ${incident.label || 'Unknown'} (Severity: ${incident.severity})`}
              />
            );
          })}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
          style={{ left: `${timeToPercent(currentTimeMs)}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
        </div>

        {/* Hover tooltip */}
        {hoveredTime !== null && (
          <div
            className="absolute -top-12 transform -translate-x-1/2 bg-slate-800 px-2 py-1 rounded text-xs whitespace-nowrap z-20 pointer-events-none"
            style={{ left: `${timeToPercent(hoveredTime)}%` }}
          >
            <div className="font-mono">{formatTime(hoveredTime)}</div>
            {hoveredWindow && (
              <div className={hoveredWindow.is_anomaly ? 'text-red-400' : 'text-green-400'}>
                Severity: {hoveredWindow.severity}
              </div>
            )}
          </div>
        )}

        {/* Time axis */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-slate-500">
          <span>{formatTime(visibleStart)}</span>
          <span>{formatTime((visibleStart + visibleEnd) / 2)}</span>
          <span>{formatTime(visibleEnd)}</span>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
        <div className="text-xs text-slate-400">
          {visibleIncidents.length} incident{visibleIncidents.length !== 1 ? 's' : ''} visible
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 mr-2">Zoom:</span>
          <ZoomButton active={zoomLevel === 'full'} label="Full" />
          <ZoomButton active={zoomLevel === '5m'} label="5m" />
          <ZoomButton active={zoomLevel === '1m'} label="1m" />
          <ZoomButton active={zoomLevel === '30s'} label="30s" />
        </div>
      </div>
    </div>
  );
}

function ZoomButton({ active, label }: { active: boolean; label: string }) {
  return (
    <button
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-slate-700 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

// Mini density bar for feed cards
export function DensityBar({
  data,
  className = ''
}: {
  data: number[];
  className?: string;
}) {
  const maxVal = Math.max(...data, 1);

  return (
    <div className={`flex items-end gap-px h-4 ${className}`}>
      {data.map((val, i) => {
        const heightPct = (val / maxVal) * 100;
        const isAnomaly = val >= 38; // default threshold

        return (
          <div
            key={i}
            className={`flex-1 rounded-t ${isAnomaly ? 'bg-red-500' : 'bg-slate-600'}`}
            style={{ height: `${Math.max(heightPct, 10)}%` }}
          />
        );
      })}
    </div>
  );
}
