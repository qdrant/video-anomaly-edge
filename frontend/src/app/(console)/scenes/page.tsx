'use client';

import { useApp } from '@/lib/AppContext';
import Link from 'next/link';

export default function ScenesPage() {
  const { dataset, navigateToFeed, feedId } = useApp();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 p-6">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-800 flex items-center justify-center">
          <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2">Scenes View</h1>

        <p className="text-slate-400 mb-6">
          The {dataset} dataset is configured as a single continuous master feed.
          Individual scene segmentation is not available for this dataset.
        </p>

        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 text-left">
          <div className="text-sm font-medium text-slate-300 mb-2">Current Configuration</div>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex items-center justify-between">
              <span>Dataset</span>
              <span className="font-mono text-white">{dataset}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Feed Type</span>
              <span className="font-mono text-white">Master Feed</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Structure</span>
              <span className="font-mono text-white">Continuous Timeline</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6 text-left">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="text-sm font-medium text-blue-400 mb-1">Why Master Feed?</div>
              <p className="text-xs text-slate-400">
                All testing clips are concatenated into a single continuous 10+ minute feed.
                This provides a more realistic security monitoring experience where you watch
                one continuous camera feed rather than disconnected clips.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigateToFeed(`${dataset}_master`, 0)}
            className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl font-medium transition-colors"
          >
            Go to Master Feed
          </button>
          <Link
            href="/feeds"
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium transition-colors text-center"
          >
            View All Feeds
          </Link>
        </div>

        <p className="text-xs text-slate-600 mt-6">
          Scene-level navigation will be available when datasets include multiple camera angles
          or distinct scene segments.
        </p>
      </div>
    </div>
  );
}
