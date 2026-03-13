'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VideoPreviewPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  /** CSS/SVG filter to apply on the video element */
  videoStyle?: React.CSSProperties;
  /** Extra content to render inside the video container (e.g. SVG filter defs) */
  children?: React.ReactNode;
}

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function VideoPreviewPlayer({ src, className, style, videoStyle, children }: VideoPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(e.target.value);
    setCurrentTime(video.currentTime);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    const onEnded = () => setIsPlaying(false);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('ended', onEnded);
    };
  }, [src]);

  return (
    <div className={`relative ${className ?? ''}`} style={style}>
      {children}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover nodrag"
        muted
        loop
        playsInline
        style={videoStyle}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      {/* Custom controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-5 flex flex-col gap-1 nodrag">
        <input
          type="range"
          className="w-full h-1 accent-white cursor-pointer"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-2">
          <button
            className="text-white hover:text-zinc-300 transition-colors"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="text-[10px] text-zinc-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
