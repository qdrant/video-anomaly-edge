'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchClips, getDatasets, getFeed } from '@/lib/api';
import { SearchResult, DatasetId, FeedManifest } from '@/lib/types';
import FeedPlayer, { FeedPlayerHandle } from '@/components/FeedPlayer';

interface SearchResultWithDataset extends SearchResult {
  dataset: DatasetId;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResultWithDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [anomaliesOnly, setAnomaliesOnly] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [previewResult, setPreviewResult] = useState<SearchResultWithDataset | null>(null);
  const [previewFeed, setPreviewFeed] = useState<FeedManifest | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const playerRef = useRef<FeedPlayerHandle>(null);

  const filteredResults = useMemo(() => {
    if (selectedTypes.size === 0) return results;
    return results.filter(r => r.anomaly_type && selectedTypes.has(r.anomaly_type));
  }, [results, selectedTypes]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const datasets = await getDatasets();
      const availableDatasets = datasets.filter(d => d.available);
      const allResults: SearchResultWithDataset[] = [];
      for (const ds of availableDatasets) {
        try {
          const dsResults = await searchClips(query, { anomaliesOnly, limit: 12, dataset: ds.id as DatasetId });
          allResults.push(...dsResults.map(r => ({ ...r, dataset: ds.id as DatasetId })));
        } catch (err) { console.error(`Search failed for ${ds.id}:`, err); }
      }
      allResults.sort((a, b) => b.match_score - a.match_score);
      setResults(allResults.slice(0, 24));
    } catch (err) { console.error('Search failed:', err); }
    finally { setLoading(false); }
  }, [query, anomaliesOnly]);

  const handleResultClick = useCallback(async (result: SearchResultWithDataset) => {
    setPreviewResult(result);
    setPreviewFeed(null);
    setPreviewLoading(true);
    try {
      const manifest = await getFeed(`${result.dataset}_master`, result.dataset);
      setPreviewFeed(manifest);
    } catch (err) { console.error('Failed to load feed for preview:', err); }
    finally { setPreviewLoading(false); }
  }, []);

  const closePreview = useCallback(() => { setPreviewResult(null); setPreviewFeed(null); }, []);

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="p-6 border-b border-slate-800">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Search Videos</h1>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Search for: person running, bicycle, car, throwing bag..." className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-slate-600" />
            </div>
            <button onClick={handleSearch} disabled={loading || !query.trim()} className="px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors">{loading ? 'Searching...' : 'Search'}</button>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={anomaliesOnly} onChange={(e) => setAnomaliesOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500" /><span className="text-slate-300">Anomalies only</span></label>
          </div>
          {!query && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-xs text-slate-500">Try:</span>
              {['person running', 'bicycle', 'throwing object', 'unusual behavior', 'crowd'].map(q => (
                <button key={q} onClick={() => setQuery(q)} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-full text-xs transition-colors">{q}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" /></div>
          ) : results.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4"><span className="text-slate-400 text-sm">{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}</span></div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {filteredResults.map((result, idx) => (
                  <div key={`${result.dataset}-${result.clip_id}-${idx}`} className="rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 transition-all cursor-pointer group" onClick={() => handleResultClick(result)}>
                    <div className="aspect-video bg-slate-800 relative overflow-hidden">
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-green-500/80 text-white rounded text-xs font-medium">{Math.round(result.match_score * 100)}% match</div>
                      {result.is_anomaly && <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500/80 text-white rounded text-xs font-medium">Anomaly</div>}
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-xs font-mono">{formatTime(result.start_time)}</div>
                    </div>
                    <div className="p-2 bg-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 truncate">{result.anomaly_type ? result.anomaly_type.charAt(0).toUpperCase() + result.anomaly_type.slice(1) : result.dataset}</span>
                        <span className={`text-xs font-mono ${Math.round(result.anomaly_score * 1000) >= 70 ? 'text-red-400' : Math.round(result.anomaly_score * 1000) >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>{Math.round(result.anomaly_score * 1000)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : searched ? (
            <div className="text-center py-16"><div className="text-slate-400">No results found</div><p className="text-sm text-slate-600 mt-1">Try different keywords</p></div>
          ) : (
            <div className="text-center py-16"><div className="text-slate-400 mb-2">Search across all cameras</div><p className="text-sm text-slate-600">Enter keywords to find matching video clips using semantic search</p></div>
          )}
        </div>
      </div>

      {previewResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closePreview}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative z-10 w-full max-w-4xl mx-4 bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-300">{previewResult.dataset} &middot; {previewResult.scene_id}</span>
                <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-mono">{Math.round(previewResult.match_score * 100)}% match</span>
                {previewResult.is_anomaly && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">Anomaly</span>}
              </div>
              <button onClick={closePreview} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="bg-black">
              {previewLoading && <div className="flex items-center justify-center h-[450px]"><div className="w-10 h-10 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin" /></div>}
              {!previewLoading && !previewFeed && <div className="flex items-center justify-center h-[450px] text-red-400 text-sm">Failed to load feed</div>}
              {previewFeed && <FeedPlayer ref={playerRef} feed={previewFeed} initialFeedTime={previewResult.start_time * 1000} autoPlay showOverlay />}
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between">
              <div className="text-sm text-slate-400">Clip {previewResult.clip_id} &middot; Score {Math.round(previewResult.anomaly_score * 1000)}</div>
              <button onClick={closePreview} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FORMAT_BASE_TIME = new Date('2026-02-16T14:11:00');
function formatTime(sec: number): string {
  const time = new Date(FORMAT_BASE_TIME.getTime() + sec * 1000);
  return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}
