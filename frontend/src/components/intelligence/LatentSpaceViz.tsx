'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

export interface LatentPoint {
  clip_id: string;
  source_video: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  x: number;
  y: number;
  is_training: boolean;
  is_anomaly: boolean | null;
  similarity?: number; // Added when search is active
  // Enhanced labels
  label?: string;
  description?: string;
  severity?: string;
  anomaly_score?: number;
  time_range?: string;
  scene?: string;
  anomaly_type?: string;
}

// Consistent color palette for anomaly types
export const ANOMALY_TYPE_COLORS: Record<string, string> = {
  vehicle:   '#f97316', // orange-500
  bike:      '#06b6d4', // cyan-500
  board:     '#a855f7', // purple-500
  running:   '#ef4444', // red-500
  fight:     '#dc2626', // red-600
  barrier:   '#eab308', // yellow-500
  loiter:    '#84cc16', // lime-500
  loitering: '#84cc16', // lime-500
  person:    '#ec4899', // pink-500
  throwing:  '#f43f5e', // rose-500
  unknown:   '#6366f1', // indigo-500
  other:     '#8b5cf6', // violet-500
  normal:    '#3b82f6', // blue-500
  training:  '#475569', // slate-600
};

export interface LatentSpaceFilters {
  showTraining: boolean;
  showNormal: boolean;
  showAnomalies: boolean;
  selectedTypes: Set<string>; // empty = show all
}

interface LatentSpaceVizProps {
  points: LatentPoint[];
  currentClipId: string | null;
  highlightedClipIds: string[];
  searchActive: boolean;
  filters?: LatentSpaceFilters;
  onPointClick: (point: LatentPoint) => void;
  onPointHover: (point: LatentPoint | null) => void;
  className?: string;
}

function getPointCategory(point: LatentPoint): string {
  if (point.is_training) return 'training';
  if (!point.is_anomaly) return 'normal';
  return point.anomaly_type || 'unknown';
}

function getPointColor(point: LatentPoint): string {
  const cat = getPointCategory(point);
  return ANOMALY_TYPE_COLORS[cat] || ANOMALY_TYPE_COLORS.unknown;
}

export default function LatentSpaceViz({
  points,
  currentClipId,
  highlightedClipIds,
  searchActive,
  filters,
  onPointClick,
  onPointHover,
  className = '',
}: LatentSpaceVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<LatentPoint | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  // Update dimensions on resize using ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Initial update
    updateDimensions();

    // Use ResizeObserver for accurate tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Draw the visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const padding = 20;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#1e293b'; // slate-800
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = padding + (plotWidth / 4) * i;
      const y = padding + (plotHeight / 4) * i;

      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Helper to convert normalized coords to canvas coords
    const toCanvas = (nx: number, ny: number) => ({
      x: padding + nx * plotWidth,
      y: padding + (1 - ny) * plotHeight, // Flip Y
    });

    // Filter points
    const visiblePoints = points.filter((p) => {
      if (!filters) return true;
      const cat = getPointCategory(p);
      if (p.is_training && !filters.showTraining) return false;
      if (!p.is_training && !p.is_anomaly && !filters.showNormal) return false;
      if (p.is_anomaly && !filters.showAnomalies) return false;
      if (filters.selectedTypes.size > 0 && p.is_anomaly && !filters.selectedTypes.has(cat)) return false;
      return true;
    });

    // Sort: training first, then normal, then anomalies, then highlighted
    const sortedPoints = [...visiblePoints].sort((a, b) => {
      const aHighlighted = highlightedClipIds.includes(a.clip_id);
      const bHighlighted = highlightedClipIds.includes(b.clip_id);
      if (aHighlighted !== bHighlighted) return aHighlighted ? 1 : -1;
      if (a.is_training !== b.is_training) return a.is_training ? -1 : 1;
      if (a.is_anomaly !== b.is_anomaly) return a.is_anomaly ? 1 : -1;
      return 0;
    });

    // Draw points
    sortedPoints.forEach((point) => {
      const { x, y } = toCanvas(point.x, point.y);
      const isHighlighted = highlightedClipIds.includes(point.clip_id);
      const isCurrent = point.clip_id === currentClipId;
      const isHovered = point.clip_id === hoveredPoint?.clip_id;

      let color = getPointColor(point);
      let alpha = point.is_training ? 0.5 : 0.8;
      let radius = point.is_training ? 3 : (point.is_anomaly ? 5 : 4);

      // Dim non-matching in search mode
      if (searchActive && point.similarity !== undefined) {
        alpha = 0.2 + point.similarity * 0.8;
        radius = 3 + point.similarity * 4;
      } else if (searchActive && point.similarity === undefined) {
        alpha = 0.15;
        radius = 2;
      }

      // Override for highlighted/current/hovered
      if (isHighlighted) {
        color = '#f59e0b';
        alpha = 1;
        radius = 6;
      }
      if (isCurrent) {
        color = '#fbbf24';
        alpha = 1;
        radius = 8;
      }
      if (isHovered) {
        radius += 2;
        alpha = 1;
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isCurrent) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw cluster labels at centroid of each anomaly type group
    const groups: Record<string, { sumX: number; sumY: number; count: number }> = {};
    visiblePoints.forEach((p) => {
      if (p.is_training) return; // skip training label, too noisy
      const cat = getPointCategory(p);
      if (!groups[cat]) groups[cat] = { sumX: 0, sumY: 0, count: 0 };
      const { x, y } = toCanvas(p.x, p.y);
      groups[cat].sumX += x;
      groups[cat].sumY += y;
      groups[cat].count++;
    });

    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    Object.entries(groups).forEach(([cat, g]) => {
      if (g.count < 2) return; // don't label singletons
      const cx = g.sumX / g.count;
      const cy = g.sumY / g.count - 14; // offset above cluster
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      // Background pill
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2, cy - 8, tw, 16, 4);
      ctx.fill();
      // Text
      ctx.fillStyle = ANOMALY_TYPE_COLORS[cat] || '#94a3b8';
      ctx.fillText(label, cx, cy + 4);
    });
    ctx.textAlign = 'start';

  }, [points, currentClipId, highlightedClipIds, searchActive, hoveredPoint, dimensions, filters]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { width, height } = dimensions;
    const padding = 20;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Find closest point
    let closest: LatentPoint | null = null;
    let minDist = Infinity;

    points.forEach((point) => {
      const x = padding + point.x * plotWidth;
      const y = padding + (1 - point.y) * plotHeight;
      const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);

      if (dist < 15 && dist < minDist) {
        minDist = dist;
        closest = point;
      }
    });

    if (closest !== hoveredPoint) {
      setHoveredPoint(closest);
      onPointHover(closest);
    }
  }, [points, dimensions, hoveredPoint, onPointHover]);

  // Handle click
  const handleClick = useCallback(() => {
    if (hoveredPoint) {
      onPointClick(hoveredPoint);
    }
  }, [hoveredPoint, onPointClick]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoveredPoint(null);
          onPointHover(null);
        }}
        onClick={handleClick}
      />

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute pointer-events-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl z-10 max-w-[280px]"
          style={{
            left: `${20 + hoveredPoint.x * (dimensions.width - 40)}px`,
            top: `${20 + (1 - hoveredPoint.y) * (dimensions.height - 40) - 80}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: getPointColor(hoveredPoint) + '30',
                color: getPointColor(hoveredPoint),
              }}
            >
              {hoveredPoint.is_training
                ? 'Baseline'
                : hoveredPoint.anomaly_type
                  ? hoveredPoint.anomaly_type.charAt(0).toUpperCase() + hoveredPoint.anomaly_type.slice(1)
                  : hoveredPoint.is_anomaly ? 'Anomaly' : 'Normal'}
            </span>
            <span className="text-slate-500">{hoveredPoint.time_range || `${hoveredPoint.start_time}s`}</span>
          </div>

          {/* Description - the main content */}
          {hoveredPoint.description && (
            <div className="text-slate-200 mt-1.5 leading-snug">
              {hoveredPoint.description}
            </div>
          )}

          <div className="text-slate-500 mt-1.5 flex items-center justify-between">
            <span className="font-mono text-xs">{hoveredPoint.clip_id}</span>
            {hoveredPoint.similarity !== undefined && (
              <span className="text-amber-400 text-xs">
                {Math.round(hoveredPoint.similarity * 100)}% match
              </span>
            )}
          </div>
        </div>
      )}

      {/* Title overlay */}
      <div className="absolute top-2 left-2 text-xs text-slate-400">
        Latent Space ({points.length} vectors)
      </div>
    </div>
  );
}
