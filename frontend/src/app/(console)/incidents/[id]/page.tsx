'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Legacy incident detail page - redirect to feeds page with drawer open
export default function IncidentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { dataset, navigateToFeed } = useApp();

  useEffect(() => {
    const [sceneId, clipIndex] = id.split('_');

    if (sceneId && clipIndex && !isNaN(parseInt(clipIndex))) {
      const clipNum = parseInt(clipIndex);
      const sceneNum = parseInt(sceneId) || 0;
      const approxTimeMs = (sceneNum - 1) * 60000 + clipNum * 10000;

      navigateToFeed(`${dataset}_master`, approxTimeMs);
    } else {
      router.push(`/incidents?incident=${id}`);
    }
  }, [id, dataset, navigateToFeed, router]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Redirecting to Feed View...</p>
      </div>
    </div>
  );
}
