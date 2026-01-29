'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Window, Incident } from '@/lib/types';

type ZoomLevel = '1x' | '5x' | '20x';

interface ContinuousTimelineProps {
  durationMs: number;
  windows: Window[];
  incidents: Incident[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  onIncidentClick: (incident: Incident) => void;
  onRangeSelect?: (startMs: number, endMs: number) => void;
}

export default function ContinuousTimeline({
  durationMs,
  windows,
  incidents,
  currentTimeMs,
  onSeek,
  onIncidentClick,
  onRangeSelect,
}: ContinuousTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Zoom state
  const [zoom, setZoom] = useState<ZoomLevel>('1x');
  const [viewStartMs, setViewStartMs] = useState(0);

  // Hover state
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<Window | null>(null);
  const [hoveredIncident, setHoveredIncident] = useState<Incident | null>(null);

  // Range selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [showActionBar, setShowActionBar] = useState(false);

  // Calculate visible window based on zoom
  const visibleDurationMs = useMemo(() => {
    switch (zoom) {
      case '1x': return durationMs;
      case '5x': return Math.min(120000, durationMs); // ~2 min
      case '20x': return Math.min(30000, durationMs); // ~30s
    }
  }, [zoom, durationMs]);

  // Keep playhead in view when zoomed
  useEffect(() => {
    if (zoom === '1x') {
      setViewStartMs(0);
      return;
    }

    // Center on current time if it's outside the visible range
    const viewEndMs = viewStartMs + visibleDurationMs;
    if (currentTimeMs < viewStartMs || currentTimeMs > viewEndMs) {
      const newStart = Math.max(0, Math.min(
        currentTimeMs - visibleDurationMs / 2,
        durationMs - visibleDurationMs
      ));
      setViewStartMs(newStart);
    }
  }, [currentTimeMs, zoom, viewStartMs, visibleDurationMs, durationMs]);

  // Convert screen position to timeline time
  const positionToTime = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return viewStartMs + pct * visibleDurationMs;
  }, [viewStartMs, visibleDurationMs]);

  // Convert time to percentage position in current view
  const timeToPercent = useCallback((ms: number): number => {
    const relativeMs = ms - viewStartMs;
    return (relativeMs / visibleDurationMs) * 100;
  }, [viewStartMs, visibleDurationMs]);

  // Find window at time
  const findWindowAtTime = useCallback((timeMs: number): Window | null => {
    return windows.find(w =>
      timeMs >= w.feed_t_start_ms && timeMs < w.feed_t_end_ms
    ) || null;
  }, [windows]);

  // Find incident at time
  const findIncidentAtTime = useCallback((timeMs: number): Incident | null => {
    return incidents.find(i =>
      timeMs >= i.feed_t_start_ms && timeMs < i.feed_t_end_ms
    ) || null;
  }, [incidents]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const time = positionToTime(e.clientX);
    setHoveredTime(time);
    setHoveredWindow(findWindowAtTime(time));
    setHoveredIncident(findIncidentAtTime(time));

    if (isSelecting && selectionStart !== null) {
      setSelectionEnd(time);
    }
  }, [positionToTime, findWindowAtTime, findIncidentAtTime, isSelecting, selectionStart]);

  // Handle mouse down - start selection or seek
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Left click only
    if (e.button !== 0) return;

    const time = positionToTime(e.clientX);
    setIsSelecting(true);
    setSelectionStart(time);
    setSelectionEnd(time);
    setShowActionBar(false);
  }, [positionToTime]);

  // Handle mouse up - end selection or click
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isSelecting) return;

    const time = positionToTime(e.clientX);
    const selectionThreshold = 500; // 500ms minimum for selection

    if (selectionStart !== null && Math.abs(time - selectionStart) > selectionThreshold) {
      // Selection made
      const start = Math.min(selectionStart, time);
      const end = Math.max(selectionStart, time);
      setSelectionEnd(end);
      setShowActionBar(true);
      onRangeSelect?.(start, end);
    } else {
      // Just a click - seek or open incident
      const incident = findIncidentAtTime(time);
      if (incident) {
        onIncidentClick(incident);
      } else {
        onSeek(time);
      }
      clearSelection();
    }

    setIsSelecting(false);
  }, [isSelecting, selectionStart, positionToTime, findIncidentAtTime, onIncidentClick, onSeek, onRangeSelect]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setShowActionBar(false);
  }, []);

  // Handle zoom change
  const handleZoomChange = useCallback((newZoom: ZoomLevel) => {
    if (newZoom === zoom) return;

    setZoom(newZoom);

    // When zooming in, center on current playhead position
    if (newZoom !== '1x') {
      const newVisibleDuration = newZoom === '5x'
        ? Math.min(120000, durationMs)
        : Math.min(30000, durationMs);

      const newStart = Math.max(0, Math.min(
        currentTimeMs - newVisibleDuration / 2,
        durationMs - newVisibleDuration
      ));
      setViewStartMs(newStart);
    } else {
      setViewStartMs(0);
    }

    clearSelection();
  }, [zoom, currentTimeMs, durationMs, clearSelection]);

  // Pan timeline when zoomed
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (zoom === '1x') return;

    e.preventDefault();
    const delta = e.deltaX || e.deltaY;
    const panAmount = visibleDurationMs * 0.1 * Math.sign(delta);

    const newStart = Math.max(0, Math.min(
      viewStartMs + panAmount,
      durationMs - visibleDurationMs
    ));
    setViewStartMs(newStart);
  }, [zoom, viewStartMs, visibleDurationMs, durationMs]);

  // Format time display
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Filter windows/incidents to visible range
  const visibleWindows = useMemo(() => {
    const viewEnd = viewStartMs + visibleDurationMs;
    return windows.filter(w =>
      w.feed_t_end_ms > viewStartMs && w.feed_t_start_ms < viewEnd
    );
  }, [windows, viewStartMs, visibleDurationMs]);

  const visibleIncidents = useMemo(() => {
    const viewEnd = viewStartMs + visibleDurationMs;
    return incidents.filter(i =>
      i.feed_t_end_ms > viewStartMs && i.feed_t_start_ms < viewEnd
    );
  }, [incidents, viewStartMs, visibleDurationMs]);

  // Get severity color
  const getSeverityColor = (severity: number, isAnomaly: boolean): string => {
    if (!isAnomaly) return 'bg-slate-600';
    if (severity >= 70) return 'bg-red-500';
    if (severity >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Selection range
  const selectionRange = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return null;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return { start, end };
  }, [selectionStart, selectionEnd]);

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      {/* Controls row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">
            {formatTime(currentTimeMs)} / {formatTime(durationMs)}
          </span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Zoom:</span>
          <div className="flex bg-slate-700 rounded-lg p-0.5">
            {(['1x', '5x', '20x'] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => handleZoomChange(level)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  zoom === level
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Severity legend */}
          <div className="flex items-center gap-2 ml-4 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>Med</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Low</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline container */}
      <div
        ref={containerRef}
        className="relative"
        onMouseLeave={() => {
          setHoveredTime(null);
          setHoveredWindow(null);
          setHoveredIncident(null);
        }}
      >
        {/* Main timeline */}
        <div
          ref={timelineRef}
          className="relative h-16 cursor-crosshair select-none"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Background */}
          <div className="absolute inset-0 bg-slate-900 rounded" />

          {/* Severity bars */}
          <div className="absolute inset-x-0 top-0 h-10 flex items-end">
            {visibleWindows.map((w) => {
              const left = Math.max(0, timeToPercent(w.feed_t_start_ms));
              const right = Math.min(100, timeToPercent(w.feed_t_end_ms));
              const width = right - left;
              const height = Math.max(15, (w.severity / 100) * 100);

              if (width <= 0) return null;

              return (
                <div
                  key={w.window_id}
                  className={`absolute bottom-0 transition-opacity ${
                    getSeverityColor(w.severity, w.is_anomaly)
                  } ${w.is_anomaly ? 'opacity-80 hover:opacity-100' : 'opacity-40'}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.5)}%`,
                    height: `${height}%`,
                  }}
                />
              );
            })}
          </div>

          {/* Incident markers (bottom track) */}
          <div className="absolute inset-x-0 bottom-2 h-4">
            {visibleIncidents.map((incident) => {
              const left = Math.max(0, timeToPercent(incident.feed_t_start_ms));
              const right = Math.min(100, timeToPercent(incident.feed_t_end_ms));
              const width = right - left;

              if (width <= 0) return null;

              return (
                <div
                  key={incident.incident_id}
                  className={`absolute h-full rounded cursor-pointer transition-all ${
                    incident.severity >= 70 ? 'bg-red-500' :
                    incident.severity >= 40 ? 'bg-yellow-500' :
                    'bg-green-500'
                  } ${hoveredIncident?.incident_id === incident.incident_id ? 'ring-2 ring-white' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 1)}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIncidentClick(incident);
                  }}
                />
              );
            })}
          </div>

          {/* Selection range */}
          {selectionRange && (
            <div
              className="absolute top-0 bottom-0 bg-blue-500/30 border-x-2 border-blue-500"
              style={{
                left: `${timeToPercent(selectionRange.start)}%`,
                width: `${timeToPercent(selectionRange.end) - timeToPercent(selectionRange.start)}%`,
              }}
            />
          )}

          {/* Playhead */}
          {currentTimeMs >= viewStartMs && currentTimeMs <= viewStartMs + visibleDurationMs && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
              style={{ left: `${timeToPercent(currentTimeMs)}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
            </div>
          )}

          {/* Hover indicator */}
          {hoveredTime !== null && !isSelecting && (
            <div
              className="absolute top-0 bottom-0 w-px bg-slate-500 pointer-events-none"
              style={{ left: `${timeToPercent(hoveredTime)}%` }}
            />
          )}
        </div>

        {/* Hover tooltip */}
        {hoveredTime !== null && (
          <div
            className="absolute -top-12 transform -translate-x-1/2 bg-slate-700 px-3 py-2 rounded-lg text-xs z-20 pointer-events-none shadow-lg min-w-max"
            style={{ left: `${timeToPercent(hoveredTime)}%` }}
          >
            <div className="font-mono text-white">{formatTime(hoveredTime)}</div>
            {hoveredWindow && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  hoveredWindow.is_anomaly ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                }`}>
                  {hoveredWindow.is_anomaly ? 'ANOMALY' : 'NORMAL'}
                </span>
                <span className="text-slate-400">Severity: {hoveredWindow.severity}</span>
              </div>
            )}
            {hoveredIncident && (
              <div className="mt-1 text-blue-400">
                {hoveredIncident.label || `Incident ${hoveredIncident.incident_id.split('_').pop()}`}
              </div>
            )}
          </div>
        )}

        {/* Time labels */}
        <div className="flex justify-between text-xs text-slate-500 mt-2 font-mono">
          <span>{formatTime(viewStartMs)}</span>
          {zoom !== '1x' && (
            <span className="text-slate-600">
              Viewing {formatTime(visibleDurationMs)} window
            </span>
          )}
          <span>{formatTime(viewStartMs + visibleDurationMs)}</span>
        </div>

        {/* Action bar for selection */}
        {showActionBar && selectionRange && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 shadow-xl z-30">
            <span className="text-xs text-slate-400 mr-2">
              {formatTime(selectionRange.start)} - {formatTime(selectionRange.end)}
            </span>
            <button
              onClick={() => {
                onSeek(selectionRange.start);
                clearSelection();
              }}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded text-xs font-medium transition-colors"
            >
              Play from here
            </button>
            <button
              onClick={() => {
                // Find incident in range
                const incident = incidents.find(i =>
                  i.feed_t_start_ms >= selectionRange.start && i.feed_t_start_ms <= selectionRange.end
                );
                if (incident) {
                  onIncidentClick(incident);
                }
                clearSelection();
              }}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs font-medium transition-colors"
            >
              Open Explain
            </button>
            <button
              onClick={() => {
                // TODO: Implement Find Similar
                clearSelection();
              }}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs font-medium transition-colors"
            >
              Find Similar
            </button>
            <button
              onClick={clearSelection}
              className="p-1.5 hover:bg-slate-600 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Minimap when zoomed */}
      {zoom !== '1x' && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <div className="text-xs text-slate-500 mb-1">Overview</div>
          <div
            className="relative h-4 bg-slate-900 rounded cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const clickTime = pct * durationMs;

              // Center view on clicked position
              const newStart = Math.max(0, Math.min(
                clickTime - visibleDurationMs / 2,
                durationMs - visibleDurationMs
              ));
              setViewStartMs(newStart);
            }}
          >
            {/* All severity bars (mini) */}
            {windows.map((w) => {
              const left = (w.feed_t_start_ms / durationMs) * 100;
              const width = ((w.feed_t_end_ms - w.feed_t_start_ms) / durationMs) * 100;

              return (
                <div
                  key={w.window_id}
                  className={`absolute h-full ${getSeverityColor(w.severity, w.is_anomaly)} opacity-60`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.3)}%`,
                  }}
                />
              );
            })}

            {/* Visible range indicator */}
            <div
              className="absolute h-full bg-white/20 border border-white/40 rounded"
              style={{
                left: `${(viewStartMs / durationMs) * 100}%`,
                width: `${(visibleDurationMs / durationMs) * 100}%`,
              }}
            />

            {/* Playhead on minimap */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
              style={{ left: `${(currentTimeMs / durationMs) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
