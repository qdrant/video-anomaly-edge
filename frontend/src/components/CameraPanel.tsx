'use client';

import { useState } from 'react';
import { FeedSummary, Incident } from '@/lib/types';

interface CameraPanelProps {
  feeds: FeedSummary[];
  currentFeedId: string | null;
  incidents: Incident[];
  patrolMode: boolean;
  autoFollow: boolean;
  onSelectFeed: (feedId: string) => void;
  onTogglePatrol: () => void;
  onToggleAutoFollow: () => void;
}

export default function CameraPanel({
  feeds,
  currentFeedId,
  incidents,
  patrolMode,
  autoFollow,
  onSelectFeed,
  onTogglePatrol,
  onToggleAutoFollow,
}: CameraPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScene, setFilterScene] = useState<string | null>(null);

  // Get unique scenes from feeds
  const scenes = [...new Set(feeds.map(f => f.scene_id).filter((s): s is string => Boolean(s)))];

  // Filter feeds
  const filteredFeeds = feeds.filter(feed => {
    if (searchQuery && !feed.label.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterScene && feed.scene_id !== filterScene) {
      return false;
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Cameras</h2>
          <span className="text-xs text-slate-500">{feeds.length} feeds</span>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cameras..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-sm placeholder-slate-500 focus:outline-none focus:border-slate-600"
          />
        </div>

        {/* Scene Filter */}
        {scenes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterScene(null)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filterScene === null
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-700'
              }`}
            >
              All
            </button>
            {scenes.slice(0, 5).map(scene => (
              <button
                key={scene}
                onClick={() => setFilterScene(scene === filterScene ? null : scene)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  filterScene === scene
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-transparent hover:border-slate-700'
                }`}
              >
                {scene}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Patrol Controls */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <button
          onClick={onTogglePatrol}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-all ${
            patrolMode
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          {patrolMode ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Patrol Active</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Start Patrol</span>
            </>
          )}
        </button>

        {/* Auto-follow Toggle */}
        <button
          onClick={onToggleAutoFollow}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 rounded-lg cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-sm text-slate-300">Auto-follow alerts</span>
          </div>
          <div className={`w-9 h-5 rounded-full transition-colors relative ${autoFollow ? 'bg-blue-500' : 'bg-slate-700'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoFollow ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>
      </div>

      {/* Camera List */}
      <div className="flex-1 overflow-y-auto">
        {filteredFeeds.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            No cameras match your filters
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filteredFeeds.map((feed) => (
              <CameraRow
                key={feed.feed_id}
                feed={feed}
                selected={feed.feed_id === currentFeedId}
                onClick={() => onSelectFeed(feed.feed_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Total incidents: {feeds.reduce((sum, f) => sum + (f.incident_count || 0), 0)}</span>
          <span>Active: {feeds.filter(f => f.incident_count && f.incident_count > 0).length}</span>
        </div>
      </div>
    </div>
  );
}

function CameraRow({
  feed,
  selected,
  onClick,
}: {
  feed: FeedSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const hasIncidents = (feed.incident_count || 0) > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'bg-slate-800'
          : 'hover:bg-slate-900'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="mt-1">
          <div className={`w-2 h-2 rounded-full ${hasIncidents ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
        </div>

        {/* Camera info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium truncate ${selected ? 'text-white' : 'text-slate-200'}`}>
              {feed.label.replace(' - All Clips', '')}
            </span>
            {hasIncidents && (
              <span className="ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                {feed.incident_count}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-500">{feed.scene_id || 'Unknown scene'}</span>
            {/* Mini sparkline placeholder */}
            <div className="flex items-end gap-px h-3">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-sm ${
                    Math.random() > 0.7 ? 'bg-red-500/60' : 'bg-slate-700'
                  }`}
                  style={{ height: `${Math.random() * 100}%` }}
                />
              ))}
            </div>
          </div>

          {feed.last_incident_time && (
            <div className="text-xs text-slate-600 mt-1">
              Last incident: {formatTimeAgo(feed.last_incident_time)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
