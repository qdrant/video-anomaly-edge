'use client';

import { ClipResult } from '@/lib/types';
import NeighborGrid from './NeighborGrid';
import AnomalyBadge from './AnomalyBadge';

interface ClipDetailsProps {
  clip: ClipResult;
  clipIndex: number;
  totalClips: number;
  threshold?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ClipDetails({
  clip,
  clipIndex,
  totalClips,
  threshold = 0.4
}: ClipDetailsProps) {
  const isAnomaly = clip.anomaly_score > threshold;

  return (
    <div className="bg-slate-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white">Clip Details</h2>
        <p className="text-slate-400">
          Clip {clipIndex + 1} of {totalClips}
        </p>
        <p className="text-slate-400">
          {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
        </p>
      </div>

      {/* Score */}
      <div>
        <p className="text-sm text-slate-400 mb-2">Anomaly Score</p>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${isAnomaly ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(clip.anomaly_score * 100, 100)}%` }}
            />
          </div>
          <span className="font-mono text-xl text-white min-w-[60px]">
            {clip.anomaly_score.toFixed(2)}
          </span>
        </div>
        <div className="mt-2">
          <AnomalyBadge isAnomaly={isAnomaly} />
        </div>
      </div>

      {/* Divider */}
      <hr className="border-slate-700" />

      {/* Explanation */}
      <div>
        <h3 className="text-sm font-medium text-white mb-1">
          {isAnomaly ? "Why it's unusual:" : "Why it's normal:"}
        </h3>
        <p className="text-sm text-slate-400">
          {isAnomaly
            ? "This clip has low similarity to normal baseline footage. The activity pattern differs significantly from typical scenes."
            : "This clip closely matches typical activity patterns seen in the training data."
          }
        </p>
      </div>

      {/* Nearest neighbors */}
      {clip.neighbors && clip.neighbors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white mb-3">
            Nearest normal clips:
          </h3>
          <NeighborGrid neighbors={clip.neighbors} />
          <p className="text-xs text-slate-500 mt-2">
            Lower similarity = more anomalous
          </p>
        </div>
      )}
    </div>
  );
}
