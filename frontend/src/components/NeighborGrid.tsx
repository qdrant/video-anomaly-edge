'use client';

import Image from 'next/image';
import { Neighbor } from '@/lib/types';

interface NeighborGridProps {
  neighbors: Neighbor[];
}

export default function NeighborGrid({ neighbors }: NeighborGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {neighbors.slice(0, 3).map((neighbor, i) => (
        <div key={i} className="space-y-1">
          <div className="relative aspect-video rounded overflow-hidden bg-slate-700">
            {neighbor.thumbnail_url ? (
              <Image
                src={neighbor.thumbnail_url}
                alt={neighbor.clip_id}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                No thumbnail
              </div>
            )}
          </div>
          <p className="text-xs text-center text-slate-400 font-mono">
            {neighbor.similarity.toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
}
