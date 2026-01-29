'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

export interface TimelinePoint {
  time_ms: number;
  clip_id: string;
  similarity: number;
  is_anomaly?: boolean;
}

interface SemanticTimelineProps {
  points: TimelinePoint[];
  durationMs: number;
  currentTimeMs: number;
  searchQuery: string | null;
  mode: 'similarity' | 'anomaly'; // similarity = query match, anomaly = outlier detection
  onSeek: (timeMs: number) => void;
  onClipClick: (clipId: string) => void;
  className?: string;
}

export default function SemanticTimeline({
  points,
  durationMs,
  currentTimeMs,
  searchQuery,
  mode,
  onSeek,
  onClipClick,
  className = '',
}: SemanticTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 80 });
  const [hoveredPoint, setHoveredPoint] = useState<TimelinePoint | null>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);

  // Update dimensions on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setDimensions({ width: rect.width, height: 45 });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Color interpolation for gradient
  const getGradientColor = (value: number, isAnomaly: boolean = false): string => {
    if (mode === 'anomaly') {
      // Anomaly mode: blue (normal) -> red (anomaly)
      if (isAnomaly) {
        // Anomalies: orange to red based on severity
        const r = 239;
        const g = Math.round(68 + (1 - value) * 100);
        const b = 68;
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Normal: gray to blue
        const r = Math.round(71 + (1 - value) * 30);
        const g = Math.round(85 + (1 - value) * 40);
        const b = Math.round(105 + value * 100);
        return `rgb(${r}, ${g}, ${b})`;
      }
    } else {
      // Similarity mode: blue (low) -> amber/gold (high)
      if (value < 0.3) {
        // Low: slate
        return `rgb(71, 85, 105)`;
      } else if (value < 0.6) {
        // Medium: blue
        const intensity = (value - 0.3) / 0.3;
        const r = 59;
        const g = Math.round(130 + intensity * 50);
        const b = 246;
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // High: amber/gold
        const intensity = (value - 0.6) / 0.4;
        const r = Math.round(59 + intensity * 186);
        const g = Math.round(180 - intensity * 22);
        const b = Math.round(246 - intensity * 209);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
  };

  // Draw the timeline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const barHeight = 24;
    const barY = 4;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // If no points, draw empty state
    if (points.length === 0) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, barY, width, barHeight);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(
        searchQuery ? 'Searching...' : 'Enter a query to visualize semantic similarity',
        width / 2,
        barY + barHeight / 2 + 4
      );
      return;
    }

    // Sort points by time
    const sortedPoints = [...points].sort((a, b) => a.time_ms - b.time_ms);

    // Draw gradient bars for each segment
    const segmentWidth = width / sortedPoints.length;

    sortedPoints.forEach((point, i) => {
      const x = i * segmentWidth;
      const color = getGradientColor(point.similarity, point.is_anomaly);

      // Create gradient for smooth blending
      const gradient = ctx.createLinearGradient(x, 0, x + segmentWidth, 0);
      gradient.addColorStop(0, color);

      // Blend with next color if available
      if (i < sortedPoints.length - 1) {
        const nextColor = getGradientColor(sortedPoints[i + 1].similarity, sortedPoints[i + 1].is_anomaly);
        gradient.addColorStop(1, nextColor);
      } else {
        gradient.addColorStop(1, color);
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(x, barY, segmentWidth + 1, barHeight);

      // Draw intensity indicator on top (subtle glow for high values)
      if (point.similarity > 0.7) {
        ctx.fillStyle = `rgba(251, 191, 36, ${(point.similarity - 0.7) * 0.5})`;
        ctx.fillRect(x, barY, segmentWidth + 1, 4);
      }
    });

    // Draw time markers - smaller font
    ctx.fillStyle = '#64748b';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';

    const numMarkers = 6;
    for (let i = 0; i <= numMarkers; i++) {
      const x = (width / numMarkers) * i;
      const timeMs = (durationMs / numMarkers) * i;
      const timeSec = Math.floor(timeMs / 1000);
      const min = Math.floor(timeSec / 60);
      const sec = timeSec % 60;

      ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, x, height - 2);

      // Tick mark
      ctx.fillStyle = '#334155';
      ctx.fillRect(x, barY + barHeight, 1, 3);
      ctx.fillStyle = '#64748b';
    }

    // Draw playhead
    const playheadX = (currentTimeMs / durationMs) * width;
    ctx.fillStyle = '#fbbf24'; // amber-400
    ctx.fillRect(playheadX - 1, barY - 2, 2, barHeight + 4);

    // Playhead triangle (smaller)
    ctx.beginPath();
    ctx.moveTo(playheadX, barY - 3);
    ctx.lineTo(playheadX + 4, barY);
    ctx.lineTo(playheadX, barY + 3);
    ctx.lineTo(playheadX - 4, barY);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    // Draw hover indicator
    if (mouseX !== null) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(mouseX - 1, barY, 2, barHeight);
    }

  }, [points, durationMs, currentTimeMs, searchQuery, mode, dimensions, mouseX]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setMouseX(x);

    // Find corresponding point
    if (points.length > 0) {
      const timeMs = (x / dimensions.width) * durationMs;
      const sortedPoints = [...points].sort((a, b) => a.time_ms - b.time_ms);

      // Find closest point
      let closest = sortedPoints[0];
      let minDist = Infinity;

      for (const point of sortedPoints) {
        const dist = Math.abs(point.time_ms - timeMs);
        if (dist < minDist) {
          minDist = dist;
          closest = point;
        }
      }

      setHoveredPoint(closest);
    }
  }, [points, durationMs, dimensions.width]);

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeMs = (x / dimensions.width) * durationMs;

    onSeek(timeMs);

    if (hoveredPoint) {
      onClipClick(hoveredPoint.clip_id);
    }
  }, [dimensions.width, durationMs, onSeek, onClipClick, hoveredPoint]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Compact header inline with legend */}
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {mode === 'similarity' ? 'Semantic Match' : 'Anomaly Detection'}
          </span>
          {searchQuery && (
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
              {searchQuery}
            </span>
          )}
        </div>

        {/* Compact legend */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {mode === 'anomaly' && (
            <>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: '#3b82f6' }} />
                <span>Normal</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: '#ef4444' }} />
                <span>Anomaly</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setMouseX(null);
          setHoveredPoint(null);
        }}
        onClick={handleClick}
      />

      {/* Hover tooltip */}
      {hoveredPoint && mouseX !== null && (
        <div
          className="absolute pointer-events-none bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs shadow-lg z-10"
          style={{
            left: `${Math.min(mouseX, dimensions.width - 120)}px`,
            top: '0px',
          }}
        >
          <div className="font-mono text-amber-400">{hoveredPoint.clip_id}</div>
          <div className="text-slate-300">
            {mode === 'similarity' ? 'Match' : 'Score'}: {Math.round(hoveredPoint.similarity * 100)}%
          </div>
          {hoveredPoint.is_anomaly && (
            <div className="text-red-400 text-xs">Anomaly</div>
          )}
        </div>
      )}
    </div>
  );
}
