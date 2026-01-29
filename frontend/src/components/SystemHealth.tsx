'use client';

import { useState, useEffect } from 'react';

interface PipelineStatus {
  mode: string;
  mode_description: string;
  embed_queue_depth: number;
  score_queue_depth: number;
  caption_queue_depth: number;
  drop_rate: number;
  is_healthy: boolean;
}

interface LatencyStats {
  embed_p95_ms: number;
  search_p95_ms: number;
  total_p95_ms: number;
}

const MODE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  normal: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  offline: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  score_only: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  passthrough: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  shed_load: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

const MODE_LABELS: Record<string, string> = {
  normal: 'NORMAL',
  offline: 'BATCH',
  score_only: 'DEGRADED',
  passthrough: 'LIMITED',
  shed_load: 'CRITICAL',
};

export default function SystemHealth() {
  const [isOpen, setIsOpen] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [latency, setLatency] = useState<LatencyStats | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [pipelineRes, latencyRes] = await Promise.all([
          fetch('/api/pipeline/status'),
          fetch('/api/latency'),
        ]);

        if (pipelineRes.ok) {
          const data = await pipelineRes.json();
          setPipelineStatus(data);
          setConnected(true);
        }

        if (latencyRes.ok) {
          const data = await latencyRes.json();
          setLatency(data);
        }
      } catch (err) {
        setConnected(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const mode = pipelineStatus?.mode || 'offline';
  const colors = MODE_COLORS[mode] || MODE_COLORS.offline;
  const label = MODE_LABELS[mode] || mode.toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${colors.bg} ${colors.border} hover:bg-opacity-20`}
      >
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className={`text-xs font-medium ${colors.text}`}>{label}</span>
        </div>
        {latency && (
          <span className="text-xs text-slate-400 font-mono">
            {Math.round(latency.total_p95_ms)}ms
          </span>
        )}
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className={`px-4 py-3 border-b border-slate-700 ${colors.bg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-500'}`} />
                  <span className={`font-semibold ${colors.text}`}>System Health</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                  {label}
                </span>
              </div>
              {pipelineStatus && (
                <p className="text-xs text-slate-400 mt-1">
                  {pipelineStatus.mode_description}
                </p>
              )}
            </div>

            <div className="p-4 border-b border-slate-800">
              <div className="text-xs font-medium text-slate-400 mb-3">Queue Depths</div>
              <div className="space-y-2">
                <QueueBar label="Embed" value={pipelineStatus?.embed_queue_depth || 0} max={10} />
                <QueueBar label="Score" value={pipelineStatus?.score_queue_depth || 0} max={20} />
                <QueueBar label="Caption" value={pipelineStatus?.caption_queue_depth || 0} max={50} />
              </div>
            </div>

            {latency && (
              <div className="p-4 border-b border-slate-800">
                <div className="text-xs font-medium text-slate-400 mb-3">Latency (p95)</div>
                <div className="grid grid-cols-3 gap-3">
                  <LatencyStat label="Embed" value={latency.embed_p95_ms} />
                  <LatencyStat label="Search" value={latency.search_p95_ms} />
                  <LatencyStat label="Total" value={latency.total_p95_ms} highlight />
                </div>
              </div>
            )}

            {pipelineStatus && pipelineStatus.drop_rate > 0 && (
              <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
                <div className="flex items-center gap-2 text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-xs font-medium">
                    Drop rate: {(pipelineStatus.drop_rate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            <div className="px-4 py-2 bg-slate-950 text-xs text-slate-500 flex items-center justify-between">
              <span>Auto-refreshing every 5s</span>
              <a href="/api/contracts" target="_blank" className="text-blue-400 hover:underline">
                View Contracts
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QueueBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-xs text-slate-400">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-xs text-slate-500 text-right font-mono">{value}</span>
    </div>
  );
}

function LatencyStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`text-center p-2 rounded-lg ${highlight ? 'bg-slate-800' : 'bg-slate-800/50'}`}>
      <div className={`text-lg font-mono font-semibold ${highlight ? 'text-white' : 'text-slate-300'}`}>
        {Math.round(value)}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
