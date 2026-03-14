'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Film, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { NodeNumberInput, NodeLabel } from './controls';
import { QuickActionsBar } from '@/components/nodes/QuickActionsBar';
import { theme } from '@/lib/theme';

export function ExtractFrameNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const [isHovered, setIsHovered] = useState(false);

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const resolved = resolveInput(id, allNodes, edges);
  const inputUrl = resolved?.url ?? null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [fps, setFps] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging] = useState(false);

  const totalFrames = useMemo(() => Math.max(1, Math.round(duration * fps)), [duration, fps]);
  const currentFrame = useMemo(() => Math.round(currentTime * fps) + 1, [currentTime, fps]);

  // Draw current frame to canvas
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    if (!video.paused) {
      setCurrentTime(video.currentTime);
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, []);

  useEffect(() => {
    if (!inputUrl || !videoSize) return;
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [inputUrl, videoSize, drawFrame]);

  // Extract frame and push to output
  const extractFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    useFlowStore.getState().updateNodeData(id, {
      status: 'done',
      results: [{
        frame: { content: dataUrl, format: 'image' },
      }],
      selectedResultIndex: 0,
      settings: { ...data.settings, timestamp: currentTime, frameNumber: currentFrame },
    });
  }, [id, data.settings, currentTime, currentFrame]);

  // Auto-extract on time change (debounced)
  const extractTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!videoSize || !inputUrl) return;
    clearTimeout(extractTimerRef.current);
    extractTimerRef.current = setTimeout(extractFrame, 200);
    return () => clearTimeout(extractTimerRef.current);
  }, [currentTime, videoSize, inputUrl, extractFrame]);

  // Thumbnail strip generation
  useEffect(() => {
    const tc = thumbCanvasRef.current;
    const container = timelineRef.current;
    if (!inputUrl || !duration || !tc || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerW = container.offsetWidth;
    const STRIP_H = 40;
    const frameW = 30;
    const count = Math.ceil(containerW / frameW);
    const step = duration / count;

    tc.width = containerW * dpr;
    tc.height = STRIP_H * dpr;
    tc.style.width = `${containerW}px`;
    tc.style.height = `${STRIP_H}px`;

    const ctx = tc.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = theme.surfaceHover;
    ctx.fillRect(0, 0, containerW, STRIP_H);

    let drawn = 0;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.src = inputUrl;
    v.muted = true;
    v.preload = 'auto';

    const drawNext = () => {
      if (drawn >= count) { v.src = ''; return; }
      v.currentTime = step * drawn + step / 2;
    };

    v.onseeked = () => {
      const dx = frameW * drawn;
      const drawW = Math.min(frameW, containerW - dx);
      if (drawW <= 0) { drawn++; drawNext(); return; }
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const srcAspect = vw / vh;
      const dstAspect = frameW / STRIP_H;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (srcAspect > dstAspect) { sw = vh * dstAspect; sx = (vw - sw) / 2; }
      else { sh = vw / dstAspect; sy = (vh - sh) / 2; }
      ctx.drawImage(v, sx, sy, sw, sh, dx, 0, drawW, STRIP_H);
      drawn++;
      drawNext();
    };

    v.onloadeddata = () => drawNext();
    return () => { v.src = ''; };
  }, [inputUrl, duration, videoSize]);

  const onVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setVideoSize({ w: video.videoWidth, h: video.videoHeight });
    video.currentTime = 0.001;
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(drawFrame);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [drawFrame]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const seekToTime = useCallback((t: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(t, duration));
    video.currentTime = clamped;
    setCurrentTime(clamped);
    if (video.paused) rafRef.current = requestAnimationFrame(drawFrame);
  }, [duration, drawFrame]);

  const getTimeFromMouse = useCallback((e: MouseEvent | React.MouseEvent) => {
    const timeline = timelineRef.current;
    if (!timeline || !duration) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  // Timeline drag
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => seekToTime(getTimeFromMouse(e));
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, getTimeFromMouse, seekToTime]);

  const timeToPercent = (t: number) => duration > 0 ? (t / duration) * 100 : 0;

  const formatTimecode = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Get extracted image URL for download/fullscreen
  const extractedImageUrl = useMemo(() => {
    if (data.results?.length) {
      const result = data.results[data.selectedResultIndex || 0];
      if (result?.frame?.content) return result.frame.content;
    }
    return undefined;
  }, [data.results, data.selectedResultIndex]);

  return (
    <div
      className="group relative flex flex-col items-center gap-1" style={{ width: 380 }}
      onClick={() => selectNode(id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Quick actions bar — outputs image */}
      <QuickActionsBar
        nodeId={id}
        selected={!!selected}
        hovered={isHovered}
        mode="image"
        fileUrl={extractedImageUrl}
      />

      {/* Top info bar */}
      <div className="absolute bottom-full left-0 mb-1 flex w-full flex-row items-center justify-between gap-2 px-1">
        <span className="text-[12px] text-zinc-500">Extract</span>
        <span className="text-[12px] text-zinc-400">{data.name}</span>
      </div>

      {/* Card */}
      <div
        className={`
          rounded-[24px] border-2 relative flex flex-col items-start
          p-4 pt-3 w-full
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
        `}
        style={{
          backgroundColor: theme.surface1,
          borderColor: selected ? undefined : theme.border1,
        }}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Film size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1">
            Extract Video Frame
          </h3>
        </header>

        {/* Input handles */}
        {data.handles.inputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -left-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.inputs.map((handle, i) => {
              const isConnected = connectedHandles.has(handle.id);
              return (
                <Handle
                  key={handle.id || i}
                  type="target"
                  position={Position.Left}
                  id={handle.id}
                  className="!relative !transform-none !w-[18px] !h-[18px] !rounded-full !border-2 !left-0 !top-0 !flex !items-center !justify-center"
                  style={{
                    backgroundColor: isConnected ? HANDLE_COLORS[handle.type] : theme.surface1,
                    borderColor: HANDLE_COLORS[handle.type],
                  }}
                >
                  <span
                    className="handle-label absolute top-[-20px] right-[14px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ color: HANDLE_COLORS[handle.type] }}
                  >
                    {handle.label}{handle.required ? ' *' : ''}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Output handles */}
        {data.handles.outputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -right-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.outputs.map((handle, i) => {
              const isConnected = connectedHandles.has(handle.id);
              return (
                <Handle
                  key={handle.id || i}
                  type="source"
                  position={Position.Right}
                  id={handle.id}
                  className="!relative !transform-none !w-[18px] !h-[18px] !rounded-full !border-2 !left-0 !top-0 !flex !items-center !justify-center"
                  style={{
                    backgroundColor: isConnected ? HANDLE_COLORS[handle.type] : theme.surface1,
                    borderColor: HANDLE_COLORS[handle.type],
                  }}
                >
                  <span
                    className="handle-label absolute top-[-20px] left-[24px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ color: HANDLE_COLORS[handle.type] }}
                  >
                    {handle.label}{handle.required ? ' *' : ''}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="self-stretch">
          {inputUrl ? (
            <div className="flex flex-col gap-3">
              {/* Video preview */}
              <div className="rounded-2xl overflow-hidden relative" style={{ backgroundColor: theme.previewBg }}>
                <video
                  ref={videoRef}
                  src={inputUrl}
                  className="hidden"
                  muted={isMuted}
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  onLoadedMetadata={onVideoLoaded}
                  onEnded={() => setIsPlaying(false)}
                />
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto"
                  style={videoSize ? { aspectRatio: `${videoSize.w}/${videoSize.h}` } : undefined}
                />
                {/* Overlay controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 flex items-center gap-2 nodrag">
                  <button
                    className="text-white hover:text-zinc-300 transition-colors"
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <span className="text-[10px] text-zinc-300 flex-1">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  <button
                    className="text-white hover:text-zinc-300 transition-colors"
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                </div>
              </div>

              {/* Filmstrip timeline */}
              <div className="flex flex-col gap-1.5">
                <div
                  ref={timelineRef}
                  className="relative h-[40px] rounded-lg overflow-hidden cursor-pointer nodrag nopan"
                  style={{ backgroundColor: theme.previewBg }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    seekToTime(getTimeFromMouse(e));
                    setDragging(true);
                  }}
                >
                  <canvas ref={thumbCanvasRef} className="absolute inset-0" />
                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 z-10"
                    style={{ left: `${timeToPercent(currentTime)}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="w-[8px] h-[8px] rounded-full bg-white mx-auto -mt-[1px]" />
                    <div className="w-[2px] h-full bg-white mx-auto" />
                  </div>
                </div>

                {/* Frame labels */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
                  <span className="text-green-400">1</span>
                  <span className="text-green-400 font-medium">{currentFrame}</span>
                  <span className="text-green-400">{totalFrames}</span>
                </div>

                {/* Frame & Timecode inputs */}
                <div className="flex items-center gap-3 nodrag">
                  <div className="flex items-center gap-1.5">
                    <NodeLabel>Frame</NodeLabel>
                    <NodeNumberInput
                      variant="narrow"
                      value={currentFrame}
                      min={1}
                      max={totalFrames}
                      onChange={(e) => {
                        const frame = Math.max(1, Math.min(Number(e.target.value), totalFrames));
                        seekToTime((frame - 1) / fps);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500">Timecode</span>
                    <div className="border rounded-md px-2 py-1 text-[11px] text-white" style={{ backgroundColor: theme.surface2, borderColor: theme.border3 }}>
                      {formatTimecode(currentTime)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-video rounded-2xl checkerboard flex items-center justify-center" style={{ backgroundColor: theme.previewBg }}>
              <span className="text-zinc-500 text-sm">Connect a video</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
