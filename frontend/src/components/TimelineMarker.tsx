'use client';

import { ClipResult } from '@/lib/types';
import Image from 'next/image';

interface TimelineMarkerProps {
  clip: ClipResult;
  index: number;
  position: number; // 0-100
  threshold: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TimelineMarker({ clip, index, position, threshold }: TimelineMarkerProps) {
  const isAnomaly = clip.anomaly_score > threshold;

  // Clamp position to keep tooltip on screen
  const clampedPosition = Math.min(Math.max(position, 10), 90);

  return (
    <div
      className="absolute bottom-full mb-2 z-50 pointer-events-none"
      style={{
        left: `${clampedPosition}%`,
        transform: 'translateX(-50%)'
      }}
    >
      <div className="bg-slate-800 rounded-lg p-3 shadow-xl border border-slate-700 w-48">
        {/* Thumbnail */}
        {clip.thumbnail_url && (
          <div className="relative aspect-video rounded overflow-hidden mb-2 bg-slate-700">
            <Image
              src={clip.thumbnail_url}
              alt={`Clip ${index}`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        {/* Info */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Clip {index + 1}</span>
            <span className="text-sm text-slate-400">
              {formatTime(clip.start_time)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-lg font-mono ${isAnomaly ? 'text-red-400' : 'text-green-400'}`}>
              {clip.anomaly_score.toFixed(2)}
            </span>
            {isAnomaly && <span className="text-red-400 text-sm">ANOMALY</span>}
          </div>
        </div>

        {/* Arrow */}
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"
        />
      </div>
    </div>
  );
}
