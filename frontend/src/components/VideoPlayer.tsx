'use client';

import { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  autoPlay?: boolean;
}

export default function VideoPlayer({
  src,
  currentTime,
  onTimeUpdate,
  autoPlay = false
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && currentTime !== undefined) {
      const diff = Math.abs(videoRef.current.currentTime - currentTime);
      if (diff > 1) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay={autoPlay}
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
      />
    </div>
  );
}
