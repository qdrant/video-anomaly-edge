'use client';

import Link from 'next/link';
import Image from 'next/image';
import { VideoSummary } from '@/lib/types';

interface VideoCardProps {
  video: VideoSummary;
}

export default function VideoCard({ video }: VideoCardProps) {
  const hasAnomalies = video.anomaly_count > 0;

  return (
    <Link
      href={`/video/${video.id}`}
      className="group block bg-slate-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-700">
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            No preview
          </div>
        )}

        {hasAnomalies && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 rounded text-xs font-bold text-white">
            {video.anomaly_count} anomal{video.anomaly_count === 1 ? 'y' : 'ies'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors">
          {video.name}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {video.total_clips} clips
          {video.total_clips > 0 && (
            <span className="ml-2">
              ({((video.anomaly_count / video.total_clips) * 100).toFixed(0)}% anomalous)
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
