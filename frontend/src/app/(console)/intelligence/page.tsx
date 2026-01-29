'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/AppContext';
import LatentSpaceViz, { LatentPoint, LatentSpaceFilters, ANOMALY_TYPE_COLORS } from '@/components/intelligence/LatentSpaceViz';
import SemanticSearchBar from '@/components/intelligence/SemanticSearchBar';

function formatCameraName(clipId: string): string {
  const stMatch = clipId.match(/^st_(\d+)_w_(\d+)_(\d+)$/);
  if (stMatch) return `Camera ${stMatch[2]} · Clip ${stMatch[3]}`;
  const wMatch = clipId.match(/^w_(\d+)_(\d+)$/);
  if (wMatch) return `Camera ${wMatch[1]} · Clip ${wMatch[2]}`;
  const sceneMatch = clipId.match(/scene_(\d+)/);
  if (sceneMatch) return `Camera ${sceneMatch[1]}`;
  return clipId;
}

export default function IntelligencePage() {
  const { dataset } = useApp();
  const [umapPoints, setUmapPoints] = useState<LatentPoint[]>([]);
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);
  const [highlightedClipIds, setHighlightedClipIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState<LatentSpaceFilters>({ showTraining: false, showNormal: false, showAnomalies: true, selectedTypes: new Set<string>() });
  const [anomalyTypes, setAnomalyTypes] = useState<{ type: string; count: number }[]>([]);

  const currentClip = umapPoints.find(p => p.clip_id === currentClipId);

  useEffect(() => {
    async function loadUmap() {
      try {
        const res = await fetch(`/api/${dataset}/embeddings/umap`);
        if (!res.ok) throw new Error('Failed to load UMAP');
        const data = await res.json();
        setUmapPoints(data.points);
        const typeCounts: Record<string, number> = {};
        data.points.forEach((p: LatentPoint) => { if (!p.is_anomaly) return; const t = p.anomaly_type || 'unknown'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
        setAnomalyTypes(Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count));
      } catch (err) { console.error('Failed to load UMAP:', err); }
    }
    loadUmap();
  }, [dataset]);

  const handleSearch = useCallback(async (query: string) => {
    setIsSearching(true);
    setSearchQuery(query);
    try {
      const res = await fetch(`/api/${dataset}/embeddings/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, limit: 50, include_training: false }) });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const resultIds = data.results.map((r: any) => r.clip_id);
      setHighlightedClipIds(resultIds);
      const similarityMap = new Map(data.results.map((r: any) => [r.clip_id, r.similarity]));
      setUmapPoints(prev => prev.map(p => ({ ...p, similarity: similarityMap.get(p.clip_id) as number | undefined })));
      if (data.results.length > 0) setCurrentClipId(data.results[0].clip_id);
    } catch (err) { console.error('Search failed:', err); }
    finally { setIsSearching(false); }
  }, [dataset]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery(null);
    setHighlightedClipIds([]);
    setUmapPoints(prev => prev.map(p => ({ ...p, similarity: undefined })));
  }, []);

  const handlePointClick = useCallback((point: LatentPoint) => { setCurrentClipId(point.clip_id); }, []);
  const handlePointHover = useCallback((point: LatentPoint | null) => {}, []);
  const toggleType = useCallback((type: string) => {
    setFilters(prev => { const next = new Set(prev.selectedTypes); if (next.has(type)) next.delete(type); else next.add(type); return { ...prev, selectedTypes: next }; });
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <SemanticSearchBar onSearch={handleSearch} onClear={handleClearSearch} isSearching={isSearching} />
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 min-h-0 overflow-hidden">
        <div className="col-span-1 md:col-span-3 flex flex-col p-3 gap-2 min-h-0">
          <div className="flex-1 bg-black rounded-lg overflow-hidden relative min-h-0">
            {currentClip ? (
              <>
                <video key={currentClip.clip_id} className="w-full h-full object-contain" controls autoPlay loop muted playsInline>
                  <source src={`/api/${dataset}/clips/${currentClip.is_training ? 'training' : 'testing'}/${currentClip.clip_id}.mp4`} type="video/mp4" />
                </video>
                <div className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${currentClip.is_anomaly ? 'bg-red-500/90 text-white' : currentClip.is_training ? 'bg-slate-600/90 text-slate-200' : 'bg-blue-500/90 text-white'}`}>
                  {currentClip.anomaly_type ? currentClip.anomaly_type.charAt(0).toUpperCase() + currentClip.anomaly_type.slice(1) : currentClip.is_anomaly ? 'Anomaly' : 'Normal'}
                </div>
                {currentClip.similarity !== undefined && <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/90 text-white backdrop-blur-sm">{Math.round(currentClip.similarity * 100)}% match</div>}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent px-4 py-3">
                  <p className="text-sm text-slate-200">{currentClip.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    <span className="text-slate-300">{formatCameraName(currentClip.clip_id)}</span>
                    <span>{currentClip.time_range}</span>
                    {currentClip.anomaly_type && <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: (ANOMALY_TYPE_COLORS[currentClip.anomaly_type] || '#6366f1') + '30', color: ANOMALY_TYPE_COLORS[currentClip.anomaly_type] || '#6366f1' }}>{currentClip.anomaly_type}</span>}
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  <div className="text-sm font-medium">Select a clip to view</div>
                  <p className="text-xs text-slate-600 mt-1">Click on the latent space or timeline</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="col-span-1 md:col-span-2 md:border-l border-t md:border-t-0 border-slate-800 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 mr-1">Filter:</span>
              {anomalyTypes.map(({ type, count }) => (
                <button key={type} onClick={() => toggleType(type)} className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${filters.selectedTypes.size === 0 || filters.selectedTypes.has(type) ? 'border-slate-600 text-slate-200' : 'bg-transparent border-slate-800 text-slate-600'}`}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: ANOMALY_TYPE_COLORS[type] || ANOMALY_TYPE_COLORS.unknown }} />
                  {type.charAt(0).toUpperCase() + type.slice(1)} <span className="text-slate-500">{count}</span>
                </button>
              ))}
              {filters.selectedTypes.size > 0 && <button onClick={() => setFilters(f => ({ ...f, selectedTypes: new Set() }))} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">Clear</button>}
            </div>
          </div>
          <div className="flex-1 p-3 min-h-0">
            <LatentSpaceViz points={umapPoints} currentClipId={currentClipId} highlightedClipIds={highlightedClipIds} searchActive={!!searchQuery} filters={filters} onPointClick={handlePointClick} onPointHover={handlePointHover} className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
