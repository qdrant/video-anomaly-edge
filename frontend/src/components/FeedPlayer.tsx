'use client';

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { FeedManifest, Segment, Window } from '@/lib/types';

interface FeedPlayerProps {
  feed: FeedManifest;
  initialFeedTime?: number;
  onFeedTimeUpdate?: (feedTimeMs: number) => void;
  onWindowChange?: (window: Window | null) => void;
  autoPlay?: boolean;
  showOverlay?: boolean;
  compact?: boolean;
  playbackRate?: number;
}

export interface FeedPlayerHandle {
  seekTo: (feedTimeMs: number) => void;
  play: () => void;
  pause: () => void;
  seekAndPlay: (feedTimeMs: number) => void;
}

const FeedPlayer = forwardRef<FeedPlayerHandle, FeedPlayerProps>(function FeedPlayer({
  feed,
  initialFeedTime = 0,
  onFeedTimeUpdate,
  onWindowChange,
  autoPlay = false,
  showOverlay = true,
  compact = false,
  playbackRate = 1.0,
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [feedTimeMs, setFeedTimeMs] = useState(initialFeedTime);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const shouldPlayOnLoad = useRef(autoPlay);
  const [currentWindow, setCurrentWindow] = useState<Window | null>(null);
  const isTransitioning = useRef(false);

  const findSegmentForTime = useCallback((timeMs: number): number => {
    for (let i = 0; i < feed.segments.length; i++) {
      const seg = feed.segments[i];
      if (timeMs >= seg.feed_start_ms && timeMs < seg.feed_start_ms + seg.duration_ms) {
        return i;
      }
    }
    return Math.max(0, feed.segments.length - 1);
  }, [feed.segments]);

  const findWindowForTime = useCallback((timeMs: number): Window | null => {
    return feed.windows.find(w =>
      timeMs >= w.feed_t_start_ms && timeMs < w.feed_t_end_ms
    ) || null;
  }, [feed.windows]);

  const lastExternalSeekRef = useRef(initialFeedTime);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    const segIdx = findSegmentForTime(initialFeedTime);
    setCurrentSegmentIndex(segIdx);
    setFeedTimeMs(initialFeedTime);
    lastExternalSeekRef.current = initialFeedTime;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Math.abs(initialFeedTime - lastExternalSeekRef.current) > 500) {
      lastExternalSeekRef.current = initialFeedTime;
      pendingSeekRef.current = initialFeedTime;

      const targetSegIdx = findSegmentForTime(initialFeedTime);
      if (targetSegIdx !== currentSegmentIndex) {
        isTransitioning.current = true;
        setCurrentSegmentIndex(targetSegIdx);
      } else {
        const segment = feed.segments[currentSegmentIndex];
        if (segment && videoRef.current) {
          const localTime = (initialFeedTime - segment.feed_start_ms) / 1000;
          videoRef.current.currentTime = Math.max(0, localTime);
          pendingSeekRef.current = null;
        }
      }
      setFeedTimeMs(initialFeedTime);
    }
  }, [initialFeedTime, findSegmentForTime, currentSegmentIndex, feed.segments]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || isTransitioning.current) return;

    const segment = feed.segments[currentSegmentIndex];
    if (!segment) return;

    const videoTime = videoRef.current.currentTime * 1000;
    const newFeedTime = segment.feed_start_ms + videoTime;

    setFeedTimeMs(newFeedTime);
    lastExternalSeekRef.current = newFeedTime;
    onFeedTimeUpdate?.(newFeedTime);

    const window = findWindowForTime(newFeedTime);
    if (window?.window_id !== currentWindow?.window_id) {
      setCurrentWindow(window);
      onWindowChange?.(window);
    }
  }, [currentSegmentIndex, feed.segments, onFeedTimeUpdate, findWindowForTime, currentWindow, onWindowChange]);

  const handleEnded = useCallback(() => {
    const nextIndex = currentSegmentIndex + 1;
    isTransitioning.current = true;
    shouldPlayOnLoad.current = true;
    if (nextIndex < feed.segments.length) {
      setCurrentSegmentIndex(nextIndex);
    } else if (currentSegmentIndex === 0) {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      setFeedTimeMs(0);
      isTransitioning.current = false;
    } else {
      setCurrentSegmentIndex(0);
      setFeedTimeMs(0);
    }
  }, [currentSegmentIndex, feed.segments.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const segment = feed.segments[currentSegmentIndex];
    if (!segment) return;

    video.src = segment.src_url;
    video.load();

    video.onloadeddata = () => {
      isTransitioning.current = false;

      if (pendingSeekRef.current !== null) {
        const targetTime = pendingSeekRef.current;
        const localTime = (targetTime - segment.feed_start_ms) / 1000;
        video.currentTime = Math.max(0, Math.min(localTime, video.duration || 10));
        pendingSeekRef.current = null;
      }

      if (shouldPlayOnLoad.current || autoPlay) {
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
        shouldPlayOnLoad.current = false;
      }
    };
  }, [currentSegmentIndex, feed.segments]);

  const seekToFeedTime = useCallback((targetTimeMs: number) => {
    const segIdx = findSegmentForTime(targetTimeMs);
    const segment = feed.segments[segIdx];
    if (!segment) return;

    const localTime = (targetTimeMs - segment.feed_start_ms) / 1000;

    if (segIdx !== currentSegmentIndex) {
      isTransitioning.current = true;
      pendingSeekRef.current = targetTimeMs;
      setCurrentSegmentIndex(segIdx);
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = localTime;
      }
    }
    setFeedTimeMs(targetTimeMs);
  }, [currentSegmentIndex, feed.segments, findSegmentForTime]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekAndPlay = useCallback((targetTimeMs: number) => {
    shouldPlayOnLoad.current = true;
    setIsPlaying(true);
    seekToFeedTime(targetTimeMs);

    const video = videoRef.current;
    if (video && !isTransitioning.current) {
      video.play().catch(() => {});
    }
  }, [seekToFeedTime]);

  useImperativeHandle(ref, () => ({
    seekTo: seekToFeedTime,
    play,
    pause,
    seekAndPlay,
  }), [seekToFeedTime, play, pause, seekAndPlay]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const BASE_TIME = new Date('2026-02-16T14:11:00');
  const formatTime = (ms: number): string => {
    const time = new Date(BASE_TIME.getTime() + ms);
    return time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const currentSegment = feed.segments[currentSegmentIndex];

  return (
    <div className={`flex flex-col bg-black rounded-lg overflow-hidden group ${compact ? 'h-full' : ''}`}>
      <div className={`relative ${compact ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          onLoadedData={() => {
            if (videoRef.current && playbackRate !== 1.0) {
              videoRef.current.playbackRate = playbackRate;
            }
          }}
          onError={() => {
            console.warn(`Segment ${currentSegmentIndex} failed, skipping`);
            handleEnded();
          }}
          playsInline
          muted
          autoPlay
        />

        {showOverlay && (
          <>
            {currentWindow && (
              <div className={`absolute top-3 left-3 px-2.5 py-1 rounded text-xs font-bold ${
                currentWindow.is_anomaly
                  ? 'bg-red-500/90 text-white'
                  : 'bg-green-500/90 text-white'
              }`}>
                {currentWindow.is_anomaly ? 'ANOMALY' : 'NORMAL'}
                {currentWindow.is_anomaly && (
                  <span className="ml-1.5 font-mono">{currentWindow.severity}</span>
                )}
              </div>
            )}

            {currentWindow?.is_anomaly && (
              <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/70 rounded text-xs">
                <span className="text-slate-400">Severity</span>
                <span className={`ml-1.5 font-mono font-bold ${
                  currentWindow.severity >= 70 ? 'text-red-400' :
                  currentWindow.severity >= 40 ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {currentWindow.severity}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {!compact && <div className="bg-slate-900/95 px-3 py-2">
        <div
          className="relative h-1 group/progress cursor-pointer mb-2 -mx-3 px-3"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seekToFeedTime(Math.max(0, Math.min(1, pct)) * feed.duration_ms);
          }}
        >
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-1 group-hover/progress:h-1.5 bg-slate-700/80 transition-all duration-150">
            {feed.windows.filter(w => w.is_anomaly).map(w => (
              <div
                key={w.window_id}
                className="absolute h-full bg-red-500/30"
                style={{
                  left: `${(w.feed_t_start_ms / feed.duration_ms) * 100}%`,
                  width: `${((w.feed_t_end_ms - w.feed_t_start_ms) / feed.duration_ms) * 100}%`,
                }}
              />
            ))}
            <div
              className="absolute h-full overflow-hidden"
              style={{ width: `${(feedTimeMs / feed.duration_ms) * 100}%` }}
            >
              <div className="absolute inset-0 bg-slate-300" />
              {feed.windows.filter(w => w.is_anomaly).map(w => (
                <div
                  key={w.window_id}
                  className="absolute h-full bg-red-500"
                  style={{
                    left: `${(w.feed_t_start_ms / feed.duration_ms) * 100}%`,
                    width: `${((w.feed_t_end_ms - w.feed_t_start_ms) / feed.duration_ms) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity duration-150 -ml-1.5 z-10 ${
              currentWindow?.is_anomaly ? 'bg-red-500' : 'bg-slate-300'
            }`}
            style={{ left: `calc(${(feedTimeMs / feed.duration_ms) * 100}% + 12px)` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-300">
            {formatTime(feedTimeMs)}
          </span>
          <div className="flex-1" />
          <span className="text-xs text-slate-500 hidden sm:block">
            {feed.label}
          </span>
        </div>
      </div>}
    </div>
  );
});

export default FeedPlayer;
