'use client';

import { ShiftLogEntry } from '@/lib/ShiftLogContext';

interface ShiftLogProps {
  entries: ShiftLogEntry[];
  onClear: () => void;
  onExport: () => void;
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatMs = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const entryIcons: Record<ShiftLogEntry['type'], { icon: string; color: string }> = {
  alert: { icon: '!', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  action: { icon: '>', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  question: { icon: '?', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  decision: { icon: '\u2713', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  clip: { icon: '\u25C9', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  note: { icon: '\u2022', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

export default function ShiftLog({ entries, onClear, onExport }: ShiftLogProps) {
  return (
    <div className="bg-slate-950 border-t border-slate-800">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-300">Shift Log</h3>
          <span className="text-xs text-slate-500">({entries.length} entries)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Export
          </button>
          <button
            onClick={onClear}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="max-h-48 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-4 py-6 text-center text-slate-500 text-xs">
            Activity will appear here as you work
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {entries.map((entry) => {
              const config = entryIcons[entry.type];
              return (
                <div key={entry.id} className="px-4 py-2 flex items-start gap-3 text-sm hover:bg-slate-900/50">
                  {/* Icon */}
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold border ${config.color} flex-shrink-0 mt-0.5`}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm">{entry.message}</div>
                    {entry.timeRange && (
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">
                        {formatMs(entry.timeRange.start)} &rarr; {formatMs(entry.timeRange.end)}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-slate-500 font-mono flex-shrink-0">
                    {formatTime(entry.timestamp)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline mini version for the sidebar
export function ShiftLogMini({ entries }: { entries: ShiftLogEntry[] }) {
  const recentEntries = entries.slice(0, 5);

  return (
    <div className="space-y-1">
      {recentEntries.map((entry) => {
        const config = entryIcons[entry.type];
        return (
          <div key={entry.id} className="flex items-center gap-2 text-xs">
            <div className={`w-4 h-4 rounded flex items-center justify-center text-xs font-bold border ${config.color}`}>
              {config.icon}
            </div>
            <span className="text-slate-400 truncate flex-1">{entry.message}</span>
            <span className="text-slate-600 font-mono text-xs">{formatTime(entry.timestamp)}</span>
          </div>
        );
      })}
      {entries.length === 0 && (
        <div className="text-xs text-slate-600 text-center py-2">No activity yet</div>
      )}
    </div>
  );
}
