'use client';

import { useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, AudioLines, Play } from 'lucide-react';
import { theme } from '@/lib/theme';

export interface MediaItem {
  content: string;
  format: 'image' | 'video' | 'audio';
  loading?: boolean;
  /** Draft slot — prepared for next generation, shows checkerboard */
  draft?: boolean;
  label?: string;
  /** Thumbnail data URL for video preview */
  thumbnail?: string;
  /** CSS aspect-ratio for loading shimmer / draft (e.g. "16/9") */
  aspectRatio?: string;
}

export interface MediaPreviewProps {
  items: MediaItem[];
  selectedIndex: number;
  onNavigate: (index: number) => void;
  onDelete: (index: number) => void;
  onImageLoad?: (width: number, height: number) => void;
  /** What to show when items array is empty */
  emptyState?: 'checkerboard' | 'shimmer' | 'none';
  /** Fixed height for empty state, default 320 */
  emptyHeight?: number;
  /** Aspect ratio for empty state (overrides emptyHeight), e.g. "16/9" */
  emptyAspectRatio?: string;
  /** Always show counter + delete (for AI nodes) */
  alwaysShowControls?: boolean;
}

export function MediaPreview({
  items,
  selectedIndex,
  onNavigate,
  onDelete,
  onImageLoad,
  emptyState = 'checkerboard',
  emptyHeight = 320,
  emptyAspectRatio,
  alwaysShowControls = false,
}: MediaPreviewProps) {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Stop playing video when navigating away
  const safeIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;
  useEffect(() => {
    const currentItem = items[safeIndex];
    if (!currentItem || currentItem.content !== playingVideo) {
      setPlayingVideo(null);
    }
  }, [safeIndex, items, playingVideo]);

  const handlePlayClick = useCallback((content: string) => {
    setPlayingVideo(content);
  }, []);

  // Empty state
  if (items.length === 0) {
    if (emptyState === 'none') return null;
    const style: React.CSSProperties = {
      backgroundColor: theme.previewBg,
      ...(emptyAspectRatio ? { aspectRatio: emptyAspectRatio } : { height: emptyHeight }),
    };
    return (
      <div
        className={`self-stretch rounded-2xl overflow-hidden ${emptyState === 'shimmer' ? 'shimmer' : 'checkerboard'}`}
        style={style}
      />
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden group/preview" style={{ backgroundColor: theme.previewBg }}>
      {/* Render ALL items, show/hide via CSS — instant switching like Imagine.art */}
      {items.map((item, i) => {
        const isSelected = i === safeIndex;
        const wrapStyle: React.CSSProperties = isSelected
          ? { display: 'block' }
          : { display: 'block', width: 0, height: 0, overflow: 'hidden', position: 'absolute', opacity: 0 };

        return (
          <div key={`${item.content || i}-${i}`} style={wrapStyle}>
            {item.loading ? (
              <>
                {item.format === 'image' && item.content && (
                  <img
                    src={item.content}
                    alt=""
                    className="hidden"
                    onLoad={(e) => onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                  />
                )}
                <div className="shimmer w-full" style={{ aspectRatio: item.aspectRatio || '1' }} />
              </>
            ) : item.draft ? (
              <div className="checkerboard w-full" style={{ aspectRatio: item.aspectRatio || '1', backgroundColor: theme.previewBg }} />
            ) : item.format === 'video' ? (
              // Video: thumbnail image with play button, click to play (like Imagine.art)
              playingVideo === item.content && isSelected ? (
                <video
                  src={item.content}
                  className="w-full nodrag"
                  controls
                  autoPlay
                  muted
                />
              ) : (
                <div
                  className="relative w-full cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handlePlayClick(item.content); }}
                >
                  {/* Use a muted paused video to show the first frame as thumbnail */}
                  <video
                    src={item.content}
                    className="w-full"
                    muted
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      if (isSelected) onImageLoad?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                    }}
                  />
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 hover:scale-110 flex items-center justify-center backdrop-blur-sm transition-all duration-200">
                      <Play size={20} className="text-white ml-0.5" fill="white" />
                    </div>
                  </div>
                </div>
              )
            ) : item.format === 'audio' ? (
              <div className="flex flex-col items-center justify-center gap-3 p-6" style={{ aspectRatio: '1' }}>
                <AudioLines size={32} className="text-zinc-500" />
                {item.label && <span className="text-zinc-400 text-xs truncate max-w-full">{item.label}</span>}
                <audio src={item.content} className="w-full nodrag" controls />
              </div>
            ) : (
              <img
                src={item.content}
                alt=""
                className="w-full h-full object-cover"
                onLoad={(e) => {
                  if (isSelected) onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
                }}
              />
            )}
          </div>
        );
      })}

      {/* Controls overlay: counter + nav + delete */}
      {(alwaysShowControls || items.length > 1) && (
        <div className={`absolute top-2 left-2 right-2 flex items-center justify-between z-10 ${alwaysShowControls ? '' : 'opacity-0 group-hover/preview:opacity-100'} transition-opacity duration-200`}>
          {/* Navigation: arrows + counter */}
          <div className="flex items-center gap-1">
            {items.length > 1 && (
              <button
                className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                onClick={(e) => { e.stopPropagation(); if (safeIndex > 0) onNavigate(safeIndex - 1); }}
              >
                <ChevronLeft size={14} className="text-white" />
              </button>
            )}
            <span className="text-xs text-white font-medium px-1.5 py-0.5 rounded-full bg-black/60">
              {safeIndex + 1}/{items.length}
            </span>
            {items.length > 1 && (
              <button
                className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                onClick={(e) => { e.stopPropagation(); if (safeIndex < items.length - 1) onNavigate(safeIndex + 1); }}
              >
                <ChevronRight size={14} className="text-white" />
              </button>
            )}
          </div>
          {/* Delete */}
          <button
            className="w-7 h-7 rounded-full bg-black/60 hover:bg-red-900/80 flex items-center justify-center nodrag transition-colors"
            onClick={(e) => { e.stopPropagation(); onDelete(safeIndex); }}
          >
            <Trash2 size={12} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
