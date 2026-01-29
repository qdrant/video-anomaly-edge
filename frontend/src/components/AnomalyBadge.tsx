'use client';

interface AnomalyBadgeProps {
  isAnomaly: boolean;
  className?: string;
}

export default function AnomalyBadge({ isAnomaly, className = '' }: AnomalyBadgeProps) {
  if (isAnomaly) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium bg-red-500/20 text-red-400 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        ANOMALY DETECTED
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium bg-green-500/20 text-green-400 ${className}`}>
      <span className="w-2 h-2 rounded-full bg-green-500" />
      Normal
    </span>
  );
}
