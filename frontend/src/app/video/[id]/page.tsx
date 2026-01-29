'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Legacy video page - redirect to feeds page
export default function VideoAnalysisPage({ params }: PageProps) {
  const { id: videoId } = use(params);
  const router = useRouter();
  const { dataset, navigateToFeed } = useApp();

  useEffect(() => {
    const videoNum = parseInt(videoId);
    const approxTimeMs = (videoNum - 1) * 60000;

    navigateToFeed(`${dataset}_master`, approxTimeMs);
  }, [videoId, dataset, navigateToFeed, router]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Redirecting to Master Feed...</p>
      </div>
    </div>
  );
}
