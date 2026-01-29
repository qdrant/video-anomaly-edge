'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';

export default function Header() {
  const router = useRouter();
  const {
    dataset,
    runId,
    datasets,
    runs,
    setDataset,
    setRun
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [datasetDropdownOpen, setDatasetDropdownOpen] = useState(false);
  const [runDropdownOpen, setRunDropdownOpen] = useState(false);

  const datasetRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datasetRef.current && !datasetRef.current.contains(e.target as Node)) {
        setDatasetDropdownOpen(false);
      }
      if (runRef.current && !runRef.current.contains(e.target as Node)) {
        setRunDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}&dataset=${dataset}`);
    }
  };

  const currentDataset = datasets.find(d => d.id === dataset);
  const currentRun = runs.find(r => r.run_id === runId);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4">
      {/* Dataset Dropdown */}
      <div className="relative" ref={datasetRef}>
        <button
          onClick={() => setDatasetDropdownOpen(!datasetDropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <span className="text-sm font-medium">{currentDataset?.name || 'Dataset'}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${datasetDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {datasetDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {datasets.map(d => (
              <button
                key={d.id}
                onClick={() => {
                  setDataset(d.id as any);
                  setDatasetDropdownOpen(false);
                }}
                disabled={!d.available}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  d.id === dataset
                    ? 'bg-slate-700 text-white'
                    : d.available
                      ? 'text-slate-300 hover:bg-slate-700'
                      : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{d.name}</span>
                  {d.available && (
                    <span className="text-xs text-slate-400">{d.anomaly_count} incidents</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Run Dropdown */}
      <div className="relative" ref={runRef}>
        <button
          onClick={() => setRunDropdownOpen(!runDropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-medium">{currentRun?.name || 'Run'}</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${runDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {runDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {runs.map(r => (
              <button
                key={r.run_id}
                onClick={() => {
                  setRun(r.run_id);
                  setRunDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  r.run_id === runId
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.name}</span>
                  {r.is_default && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">Default</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  F1: {r.metrics.f1.toFixed(1)}% &middot; Threshold: {r.params.threshold}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Global Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find moments like..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
          />
        </div>
      </form>

      {/* Mode Toggle (stubbed) */}
      <div className="flex items-center gap-1 px-1 py-1 bg-slate-800 rounded-lg">
        <button className="px-3 py-1 text-xs font-medium bg-slate-700 text-white rounded">
          Replay
        </button>
        <button className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-white rounded transition-colors">
          Live
        </button>
      </div>

      {/* Keyboard shortcut hint */}
      <div className="hidden lg:flex items-center gap-1 text-xs text-slate-500">
        <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">?</kbd>
        <span>shortcuts</span>
      </div>
    </header>
  );
}
