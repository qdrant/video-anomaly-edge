'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ClipResult } from '@/lib/types';
import TimelineMarker from './TimelineMarker';

interface TimelineProps {
  clips: ClipResult[];
  currentClip: number;
  onClipSelect: (index: number) => void;
  threshold?: number;
}

export default function Timeline({
  clips,
  currentClip,
  onClipSelect,
  threshold = 0.4
}: TimelineProps) {
  const [hoveredClip, setHoveredClip] = useState<number | null>(null);

  const maxScore = Math.max(...clips.map(c => c.anomaly_score), 0.5);

  return (
    <div className="relative w-full">
      {/* Timeline bar */}
      <div className="flex gap-[2px] h-16 items-end">
        {clips.map((clip, i) => {
          const height = (clip.anomaly_score / maxScore) * 100;
          const isAnomaly = clip.anomaly_score > threshold;
          const isCurrent = i === currentClip;
          const isHovered = i === hoveredClip;

          return (
            <motion.div
              key={i}
              className={`
                flex-1 rounded-t cursor-pointer transition-all duration-200
                ${isAnomaly ? 'bg-red-500' : 'bg-slate-400'}
                ${isCurrent ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : ''}
                ${isHovered ? 'opacity-100' : 'opacity-70 hover:opacity-90'}
              `}
              style={{ height: `${Math.max(height, 8)}%` }}
              onClick={() => onClipSelect(i)}
              onMouseEnter={() => setHoveredClip(i)}
              onMouseLeave={() => setHoveredClip(null)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            />
          );
        })}
      </div>

      {/* Hover tooltip */}
      {hoveredClip !== null && (
        <TimelineMarker
          clip={clips[hoveredClip]}
          index={hoveredClip}
          position={(hoveredClip / clips.length) * 100}
          threshold={threshold}
        />
      )}

      {/* Anomaly count */}
      <div className="mt-2 flex items-center justify-between text-sm text-slate-400">
        <span>
          {clips.filter(c => c.anomaly_score > threshold).length} anomalies detected
        </span>
        <span className="text-xs">
          Click a bar to jump to that clip
        </span>
      </div>
    </div>
  );
}
