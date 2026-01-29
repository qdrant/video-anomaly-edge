'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TopBarProps {
  onDemoScript?: () => void;
}

export default function TopBar({ onDemoScript }: TopBarProps) {
  const router = useRouter();
  const [dataset] = useState('Avenue');
  const [run, setRun] = useState('twelvelabs+qdrant');
  const [mode, setMode] = useState<'replay' | 'live'>('replay');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on / key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !showSearch && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowShortcuts(false);
      }
      if (e.key === '?' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  return (
    <>
      <header className="fixed top-0 left-16 lg:left-56 right-0 h-14 bg-slate-950/95 backdrop-blur border-b border-slate-800 flex items-center px-4 lg:px-6 z-30">
        {/* Dataset & Run selectors */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-sm cursor-pointer hover:bg-slate-700 transition-colors">
            <span className="text-slate-400">Dataset:</span>
            <span className="font-medium text-white">{dataset}</span>
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <select
            value={run}
            onChange={(e) => setRun(e.target.value)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-sm cursor-pointer hover:bg-slate-700 transition-colors border-none outline-none"
          >
            <option value="twelvelabs+qdrant">twelvelabs+qdrant</option>
            <option value="baseline">baseline</option>
            <option value="high-recall">high-recall</option>
            <option value="high-precision">high-precision</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md mx-4 lg:mx-8">
          <div
            className="relative cursor-pointer"
            onClick={() => {
              setShowSearch(true);
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-500">
              Find moments like... <kbd className="ml-2 px-1.5 py-0.5 bg-slate-700 rounded text-xs">/</kbd>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="hidden md:flex items-center gap-1 px-1 py-1 bg-slate-800 rounded-lg text-sm mr-4">
          <button
            onClick={() => setMode('replay')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'replay' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Replay
          </button>
          <button
            onClick={() => setMode('live')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'live' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Live
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <button
          onClick={() => setShowShortcuts(true)}
          className="hidden lg:flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-white text-sm mr-3 transition-colors"
        >
          <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-xs">?</kbd>
        </button>

        {/* Demo Script button */}
        <button
          onClick={onDemoScript}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 rounded-lg text-sm font-bold text-white transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="hidden lg:inline">Demo Script</span>
        </button>
      </header>

      {/* Search modal */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm" onClick={() => setShowSearch(false)}>
          <div className="w-full max-w-2xl bg-slate-900 rounded-xl shadow-2xl border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="p-4">
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search for moments... (e.g., 'person running', 'suspicious activity')"
                  className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  autoFocus
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {['person running', 'anomaly', 'suspicious', 'unusual movement'].map(q => (
                  <button
                    key={q}
                    onClick={() => {
                      setSearchQuery(q);
                      router.push(`/search?q=${encodeURIComponent(q)}`);
                      setShowSearch(false);
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
              <span>Type to search, Enter to submit</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded">Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="w-full max-w-lg bg-slate-900 rounded-xl shadow-2xl border border-slate-700 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-slate-800 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <ShortcutSection title="Navigation">
                <Shortcut keys={['g', 'o']} description="Go to Overview" />
                <Shortcut keys={['g', 's']} description="Go to Scenes" />
                <Shortcut keys={['g', 'i']} description="Go to Incidents" />
                <Shortcut keys={['g', '/']} description="Go to Search" />
                <Shortcut keys={['g', 'e']} description="Go to Evaluate" />
                <Shortcut keys={['g', 'c']} description="Go to Compare" />
              </ShortcutSection>

              <ShortcutSection title="Search">
                <Shortcut keys={['/']} description="Open search" />
                <Shortcut keys={['Esc']} description="Close search/modal" />
              </ShortcutSection>

              <ShortcutSection title="Incident Actions">
                <Shortcut keys={['n']} description="Next incident" />
                <Shortcut keys={['p']} description="Previous incident" />
                <Shortcut keys={['f']} description="Mark as false alarm" />
                <Shortcut keys={['Ctrl', 'D']} description="Demo script" />
              </ShortcutSection>

              <ShortcutSection title="Video Player">
                <Shortcut keys={['j']} description="Seek back 10s" />
                <Shortcut keys={['k']} description="Play/pause" />
                <Shortcut keys={['l']} description="Seek forward 10s" />
                <Shortcut keys={[',']} description="Previous frame" />
                <Shortcut keys={['.']} description="Next frame" />
              </ShortcutSection>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShortcutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-400 mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Shortcut({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-300">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="px-2 py-1 bg-slate-800 rounded text-xs font-mono">{key}</kbd>
            {i < keys.length - 1 && <span className="mx-1 text-slate-500">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
