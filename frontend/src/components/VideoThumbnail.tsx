'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { getVideoUrl } from '@/lib/api';
import { DatasetId } from '@/lib/types';

interface VideoThumbnailProps {
  thumbnailUrl: string;
  videoType: 'training' | 'testing';
  sceneId: string;
  startTime: number;
  endTime: number;
  alt: string;
  className?: string;
  showPlayIcon?: boolean;
  badge?: React.ReactNode;
  dataset?: DatasetId;
}

export default function VideoThumbnail({
  thumbnailUrl,
  videoType,
  sceneId,
  startTime,
  endTime,
  alt,
  className = '',
  showPlayIcon = true,
  badge,
  dataset = 'avenue',
}: VideoThumbnailProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play().catch(() => {});
    }
  }, [startTime]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !videoRef.current || !isVideoLoaded) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const duration = endTime - startTime;
    const seekTime = startTime + (percentage * duration);

    videoRef.current.currentTime = seekTime;
  }, [startTime, endTime, isVideoLoaded]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-slate-800 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Static thumbnail */}
      <Image
        src={thumbnailUrl}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-200 ${
          isHovering && isVideoLoaded ? 'opacity-0' : 'opacity-100'
        }`}
        unoptimized
      />

      {/* Video preview on hover */}
      <video
        ref={videoRef}
        src={getVideoUrl(videoType, `${sceneId}.mp4`, dataset)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
          isHovering && isVideoLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setIsVideoLoaded(true)}
      />

      {/* Scrub indicator */}
      {isHovering && isVideoLoaded && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700">
          <div className="h-full bg-red-500 transition-all" style={{ width: '0%' }} />
        </div>
      )}

      {/* Play icon */}
      {showPlayIcon && !isHovering && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Badge slot */}
      {badge}
    </div>
  );
}
