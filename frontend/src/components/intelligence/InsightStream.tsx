'use client';

import { useState, useCallback } from 'react';

interface ClipInfo {
  clip_id: string;
  source_video: string;
  start_time: number;
  end_time: number;
  similarity?: number;
  is_anomaly?: boolean;
  thumbnail_url?: string;
  // Enhanced fields
  description?: string;
  severity?: string;
  time_range?: string;
  scene?: string;
}

interface Insight {
  id: string;
  type: 'explanation' | 'similar' | 'comparison' | 'search';
  timestamp: Date;
  clip_id?: string;
  content: string;
  clips?: ClipInfo[];
  loading?: boolean;
}

interface InsightStreamProps {
  currentClip: ClipInfo | null;
  similarClips: ClipInfo[];
  normalClips: ClipInfo[];
  explanation: string | null;
  isLoadingExplanation: boolean;
  onExplainClick: () => void;
  onSimilarClick: () => void;
  onNormalClick: () => void;
  onClipClick: (clipId: string) => void;
  className?: string;
}

export default function InsightStream({
  currentClip,
  similarClips,
  normalClips,
  explanation,
  isLoadingExplanation,
  onExplainClick,
  onSimilarClick,
  onNormalClick,
  onClipClick,
  className = '',
}: InsightStreamProps) {
  const [activeTab, setActiveTab] = useState<'explain' | 'similar' | 'normal'>('explain');

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col bg-slate-900 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Insight Stream
        </h2>
        {currentClip ? (
          <p className="text-xs text-slate-400 mt-1">
            Analyzing: <span className="font-mono text-amber-400">{currentClip.clip_id}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">
            Select a clip to analyze
          </p>
        )}
      </div>

      {/* Quick action chips */}
      {currentClip && (
        <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap gap-2">
          <button
            onClick={onExplainClick}
            disabled={isLoadingExplanation}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isLoadingExplanation ? 'Analyzing...' : 'What happened here?'}
          </button>
          <button
            onClick={onSimilarClick}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-full text-xs font-medium transition-colors"
          >
            Show similar
          </button>
          <button
            onClick={onNormalClick}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-full text-xs font-medium transition-colors"
          >
            Compare to normal
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('explain')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'explain'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Explain
        </button>
        <button
          onClick={() => setActiveTab('similar')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'similar'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Similar ({similarClips.length})
        </button>
        <button
          onClick={() => setActiveTab('normal')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'normal'
              ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-800/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Normal ({normalClips.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!currentClip ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <svg className="w-12 h-12 mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <div className="font-medium">No clip selected</div>
            <p className="text-xs text-slate-600 mt-1 text-center">
              Click on a point in the latent space<br />or timeline to analyze
            </p>
          </div>
        ) : activeTab === 'explain' ? (
          <div className="space-y-4">
            {/* Semantic Description - Always show if available */}
            {currentClip.description && (
              <div className="p-4 bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentClip.is_anomaly ? 'bg-red-500/20' : 'bg-blue-500/20'
                  }`}>
                    <svg className={`w-4 h-4 ${currentClip.is_anomaly ? 'text-red-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        currentClip.severity === 'High Alert' ? 'bg-red-500/30 text-red-300' :
                        currentClip.severity === 'Medium Alert' ? 'bg-orange-500/30 text-orange-300' :
                        currentClip.severity === 'Low Alert' ? 'bg-yellow-500/30 text-yellow-300' :
                        'bg-slate-600 text-slate-300'
                      }`}>
                        {currentClip.severity || (currentClip.is_anomaly ? 'Alert' : 'Normal')}
                      </span>
                      <span className="text-xs text-slate-500">{currentClip.scene}</span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">{currentClip.description}</p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Explanation - from Pegasus */}
            {isLoadingExplanation ? (
              <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg">
                <div className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <span className="text-slate-300">Analyzing video segment with AI...</span>
              </div>
            ) : explanation ? (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs text-amber-400 mb-1 font-medium">AI Analysis</div>
                    <p className="text-sm text-slate-200 leading-relaxed">{explanation}</p>
                  </div>
                </div>
              </div>
            ) : !currentClip.description ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">Click "What happened here?" to analyze this segment</p>
              </div>
            ) : null}

            {/* Clip metadata */}
            <div className="p-3 bg-slate-800/30 rounded-lg">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Clip ID</span>
                  <div className="font-mono text-amber-400">{currentClip.clip_id}</div>
                </div>
                <div>
                  <span className="text-slate-500">Source</span>
                  <div className="text-slate-300">{currentClip.source_video}</div>
                </div>
                <div>
                  <span className="text-slate-500">Time Range</span>
                  <div className="text-slate-300">
                    {currentClip.time_range || `${formatTime(currentClip.start_time)} - ${formatTime(currentClip.end_time)}`}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Status</span>
                  <div className={currentClip.is_anomaly ? 'text-red-400' : 'text-green-400'}>
                    {currentClip.is_anomaly ? 'Anomaly Detected' : 'Normal Activity'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'similar' ? (
          <div className="space-y-2">
            {similarClips.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">Click "Show similar" to find matching patterns</p>
              </div>
            ) : (
              similarClips.map((clip) => (
                <button
                  key={clip.clip_id}
                  onClick={() => onClipClick(clip.clip_id)}
                  className="w-full flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-left transition-colors"
                >
                  {/* Thumbnail placeholder */}
                  <div className="w-16 h-10 bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                    {clip.thumbnail_url ? (
                      <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover rounded" />
                    ) : (
                      <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-amber-400 truncate">{clip.clip_id}</div>
                    <div className="text-xs text-slate-400">
                      {clip.source_video} @ {formatTime(clip.start_time)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="text-sm font-medium text-amber-400">
                      {clip.similarity !== undefined ? `${Math.round(clip.similarity * 100)}%` : '-'}
                    </div>
                    <div className={`text-xs ${clip.is_anomaly ? 'text-red-400' : 'text-slate-500'}`}>
                      {clip.is_anomaly ? 'Anomaly' : 'Normal'}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {normalClips.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">Click "Compare to normal" to see typical patterns</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-400 mb-3">
                  These are the most similar clips from the training (normal) data:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {normalClips.map((clip) => (
                    <button
                      key={clip.clip_id}
                      onClick={() => onClipClick(clip.clip_id)}
                      className="aspect-video bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg overflow-hidden relative transition-colors"
                    >
                      {clip.thumbnail_url ? (
                        <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="text-xs text-slate-300 truncate">{clip.clip_id}</div>
                        {clip.similarity !== undefined && (
                          <div className="text-xs text-amber-400">{Math.round(clip.similarity * 100)}% similar</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
