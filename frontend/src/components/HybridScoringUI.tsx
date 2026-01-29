'use client';

import { AnomalyType, ConfidenceLevel, ScoringMethod } from '@/lib/types';

/**
 * Badge displaying the anomaly type (running, throwing, loitering, etc.)
 */
export function AnomalyTypeBadge({
  type,
  size = 'sm',
  className = ''
}: {
  type: AnomalyType;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  if (!type || type === 'other') return null;

  const colors: Record<string, string> = {
    running: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    throwing: 'bg-red-500/20 text-red-400 border-red-500/30',
    loitering: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    wrong_direction: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    unusual_gesture: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    other: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const icons: Record<string, string> = {
    running: '\u26A1', // Lightning
    throwing: '\u26A0', // Warning
    loitering: '\u23F1', // Stopwatch
    wrong_direction: '\u2B05', // Arrow
    unusual_gesture: '\u270B', // Hand
    other: '\u2753', // Question
  };

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-xs',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded border font-medium ${colors[type] || colors.other} ${sizeClasses[size]} ${className}`}>
      <span>{icons[type] || icons.other}</span>
      <span className="capitalize">{type.replace('_', ' ')}</span>
    </span>
  );
}

/**
 * Confidence level indicator
 */
export function ConfidenceBadge({
  level,
  showLabel = true,
  className = ''
}: {
  level?: ConfidenceLevel;
  showLabel?: boolean;
  className?: string;
}) {
  if (!level) return null;

  const styles: Record<string, { bg: string; dots: number }> = {
    high: { bg: 'bg-green-400', dots: 3 },
    medium: { bg: 'bg-yellow-400', dots: 2 },
    low: { bg: 'bg-slate-400', dots: 1 },
  };

  const { bg, dots } = styles[level] || styles.low;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i <= dots ? bg : 'bg-slate-700'}`}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 capitalize">{level}</span>
      )}
    </div>
  );
}

/**
 * Scoring method badge (visual, hybrid, multimodal)
 */
export function ScoringMethodBadge({
  method,
  className = ''
}: {
  method?: ScoringMethod;
  className?: string;
}) {
  if (!method || method === 'visual') return null;

  const styles: Record<string, string> = {
    hybrid: 'bg-cyan-500/20 text-cyan-400',
    multimodal: 'bg-violet-500/20 text-violet-400',
    'multimodal+hybrid': 'bg-fuchsia-500/20 text-fuchsia-400',
  };

  const labels: Record<string, string> = {
    hybrid: 'Hybrid',
    multimodal: 'Multimodal',
    'multimodal+hybrid': 'Multi+Hybrid',
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[method] || ''} ${className}`}>
      {labels[method] || method}
    </span>
  );
}

/**
 * Visual breakdown of the anomaly score components
 */
export function ScoreBreakdown({
  visualScore,
  descriptionBoost,
  temporalBoost,
  totalScore,
  compact = false,
  className = '',
}: {
  visualScore?: number;
  descriptionBoost?: number;
  temporalBoost?: number;
  totalScore?: number;
  compact?: boolean;
  className?: string;
}) {
  const hasBoosts = (descriptionBoost && descriptionBoost > 0) || (temporalBoost && temporalBoost > 0);

  if (!hasBoosts && compact) return null;

  const formatScore = (score?: number) => {
    if (score === undefined || score === null) return '-';
    return (score * 100).toFixed(1);
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-1 text-xs ${className}`}>
        <span className="text-slate-500">Score:</span>
        <span className="font-mono text-slate-300">{formatScore(visualScore)}</span>
        {descriptionBoost && descriptionBoost > 0 && (
          <span className="text-cyan-400">+{formatScore(descriptionBoost)}</span>
        )}
        {temporalBoost && temporalBoost > 0 && (
          <span className="text-violet-400">+{formatScore(temporalBoost)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs text-slate-400 font-medium">Score Breakdown</div>

      {/* Visual bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Visual similarity</span>
          <span className="font-mono text-slate-300">{formatScore(visualScore)}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-400 rounded-full transition-all"
            style={{ width: `${Math.min((visualScore || 0) * 100 * 10, 100)}%` }}
          />
        </div>
      </div>

      {/* Description boost */}
      {descriptionBoost !== undefined && descriptionBoost > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-cyan-400">+ Description boost</span>
            <span className="font-mono text-cyan-400">+{formatScore(descriptionBoost)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${Math.min((descriptionBoost || 0) * 100 * 20, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Temporal boost */}
      {temporalBoost !== undefined && temporalBoost > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-violet-400">+ Temporal boost</span>
            <span className="font-mono text-violet-400">+{formatScore(temporalBoost)}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${Math.min((temporalBoost || 0) * 100 * 20, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Total */}
      {totalScore !== undefined && (
        <div className="pt-2 border-t border-slate-700">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Total anomaly score</span>
            <span className="font-mono font-bold text-red-400">{formatScore(totalScore)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Combined detection info display
 */
export function DetectionInfo({
  anomalyType,
  confidence,
  scoringMethod,
  visualScore,
  descriptionBoost,
  temporalBoost,
  compact = false,
  className = '',
}: {
  anomalyType?: AnomalyType;
  confidence?: ConfidenceLevel;
  scoringMethod?: ScoringMethod;
  visualScore?: number;
  descriptionBoost?: number;
  temporalBoost?: number;
  compact?: boolean;
  className?: string;
}) {
  const hasHybridInfo = scoringMethod && scoringMethod !== 'visual';
  const hasBoosts = (descriptionBoost && descriptionBoost > 0) || (temporalBoost && temporalBoost > 0);

  if (!anomalyType && !hasHybridInfo && !hasBoosts) return null;

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {anomalyType && <AnomalyTypeBadge type={anomalyType} size="xs" />}
        {confidence && <ConfidenceBadge level={confidence} showLabel={false} />}
        {hasHybridInfo && <ScoringMethodBadge method={scoringMethod} />}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Type and confidence row */}
      {(anomalyType || confidence) && (
        <div className="flex items-center justify-between">
          {anomalyType && <AnomalyTypeBadge type={anomalyType} size="sm" />}
          {confidence && <ConfidenceBadge level={confidence} showLabel={true} />}
        </div>
      )}

      {/* Scoring method */}
      {hasHybridInfo && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Detection method:</span>
          <ScoringMethodBadge method={scoringMethod} />
        </div>
      )}

      {/* Score breakdown */}
      {hasBoosts && (
        <ScoreBreakdown
          visualScore={visualScore}
          descriptionBoost={descriptionBoost}
          temporalBoost={temporalBoost}
        />
      )}
    </div>
  );
}
