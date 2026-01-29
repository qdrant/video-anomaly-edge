'use client';

import { useState, useEffect, useRef } from 'react';

interface AnomalyMeterProps {
  score: number;  // 0-1 normalized
  thresholdWatch: number;  // Amber threshold (e.g., 0.03)
  thresholdIncident: number;  // Red threshold (e.g., 0.045)
  maxScore?: number;  // Max possible score for display (e.g., 0.1)
  showLabels?: boolean;
  vertical?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onAlertEnter?: () => void;
  onAlertExit?: () => void;
}

export default function AnomalyMeter({
  score,
  thresholdWatch,
  thresholdIncident,
  maxScore = 0.1,
  showLabels = true,
  vertical = true,
  size = 'md',
  onAlertEnter,
  onAlertExit,
}: AnomalyMeterProps) {
  const [smoothedScore, setSmoothedScore] = useState(score);
  const [wasInAlert, setWasInAlert] = useState(false);
  const prevScoreRef = useRef(score);

  // EMA smoothing
  useEffect(() => {
    const alpha = 0.3;
    setSmoothedScore(prev => alpha * score + (1 - alpha) * prev);
  }, [score]);

  // Alert state change callbacks
  useEffect(() => {
    const isInAlert = smoothedScore >= thresholdIncident;
    if (isInAlert && !wasInAlert) {
      onAlertEnter?.();
    } else if (!isInAlert && wasInAlert) {
      onAlertExit?.();
    }
    setWasInAlert(isInAlert);
  }, [smoothedScore, thresholdIncident, wasInAlert, onAlertEnter, onAlertExit]);

  // Calculate percentages for display
  const scorePct = Math.min((smoothedScore / maxScore) * 100, 100);
  const watchPct = (thresholdWatch / maxScore) * 100;
  const incidentPct = (thresholdIncident / maxScore) * 100;

  // Determine zone
  const zone: 'normal' | 'watch' | 'incident' =
    smoothedScore >= thresholdIncident ? 'incident' :
    smoothedScore >= thresholdWatch ? 'watch' : 'normal';

  const zoneColors = {
    normal: { bg: 'bg-green-500', glow: 'shadow-green-500/50', text: 'text-green-400' },
    watch: { bg: 'bg-yellow-500', glow: 'shadow-yellow-500/50', text: 'text-yellow-400' },
    incident: { bg: 'bg-red-500', glow: 'shadow-red-500/50', text: 'text-red-400' },
  };

  const sizeStyles = {
    sm: { width: 'w-4', height: 'h-24', text: 'text-xs' },
    md: { width: 'w-6', height: 'h-32', text: 'text-sm' },
    lg: { width: 'w-8', height: 'h-48', text: 'text-base' },
  };

  const styles = sizeStyles[size];
  const colors = zoneColors[zone];

  if (vertical) {
    return (
      <div className="flex items-end gap-2">
        {/* Meter */}
        <div className={`relative ${styles.width} ${styles.height} bg-slate-800 rounded-full overflow-hidden`}>
          {/* Threshold markers */}
          <div
            className="absolute left-0 right-0 h-px bg-yellow-500/50"
            style={{ bottom: `${watchPct}%` }}
          />
          <div
            className="absolute left-0 right-0 h-px bg-red-500/50"
            style={{ bottom: `${incidentPct}%` }}
          />

          {/* Score fill */}
          <div
            className={`absolute bottom-0 left-0 right-0 transition-all duration-300 ${colors.bg} ${
              zone === 'incident' ? `animate-pulse shadow-lg ${colors.glow}` : ''
            }`}
            style={{ height: `${scorePct}%` }}
          />

          {/* Score marker */}
          <div
            className="absolute left-0 right-0 h-1 bg-white shadow-lg transition-all duration-150"
            style={{ bottom: `calc(${scorePct}% - 2px)` }}
          />
        </div>

        {/* Labels */}
        {showLabels && (
          <div className={`flex flex-col justify-between ${styles.height} py-1`}>
            <span className="text-xs text-slate-500">{(maxScore * 100).toFixed(0)}%</span>
            <span className="text-xs text-red-500/70">{(thresholdIncident * 100).toFixed(1)}%</span>
            <span className="text-xs text-yellow-500/70">{(thresholdWatch * 100).toFixed(1)}%</span>
            <span className="text-xs text-slate-500">0%</span>
          </div>
        )}

        {/* Current value */}
        <div className="flex flex-col items-center justify-end">
          <div className={`font-mono font-bold ${styles.text} ${colors.text}`}>
            {(smoothedScore * 100).toFixed(2)}%
          </div>
          <div className={`text-xs uppercase tracking-wide ${colors.text}`}>
            {zone}
          </div>
        </div>
      </div>
    );
  }

  // Horizontal version
  return (
    <div className="flex flex-col gap-1">
      {/* Current value */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Anomaly Score</span>
        <span className={`font-mono font-bold ${styles.text} ${colors.text}`}>
          {(smoothedScore * 100).toFixed(2)}%
        </span>
      </div>

      {/* Meter */}
      <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
        {/* Zone backgrounds */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-green-500/10"
          style={{ width: `${watchPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 bg-yellow-500/10"
          style={{ left: `${watchPct}%`, width: `${incidentPct - watchPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-red-500/10"
          style={{ left: `${incidentPct}%` }}
        />

        {/* Threshold markers */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/50"
          style={{ left: `${watchPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500/50"
          style={{ left: `${incidentPct}%` }}
        />

        {/* Score fill */}
        <div
          className={`absolute top-0 bottom-0 left-0 transition-all duration-300 ${colors.bg} ${
            zone === 'incident' ? `animate-pulse shadow-lg ${colors.glow}` : ''
          }`}
          style={{ width: `${scorePct}%` }}
        />
      </div>

      {/* Zone label */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Normal</span>
        <span className={`uppercase tracking-wide font-medium ${colors.text}`}>{zone}</span>
        <span className="text-slate-500">Incident</span>
      </div>
    </div>
  );
}

// Compact inline version for use in headers/cards
export function AnomalyBadge({ score, threshold }: { score: number; threshold: number }) {
  const isAnomaly = score >= threshold;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
      isAnomaly
        ? 'bg-red-500/20 text-red-400'
        : 'bg-green-500/20 text-green-400'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isAnomaly ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
      <span className="font-mono">{(score * 100).toFixed(1)}%</span>
    </div>
  );
}
