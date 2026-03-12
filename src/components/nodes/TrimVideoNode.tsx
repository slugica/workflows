'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Scissors, Play, Pause, Volume2, VolumeX, Undo2, Redo2, SplitSquareHorizontal, ArrowLeftToLine, ArrowRightToLine } from 'lucide-react';

interface Segment {
  id: string;
  start: number;
  end: number;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function TrimVideoNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();

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

  // Crop data from upstream CropNode (if any)
  const cropData = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle &&
        (e.targetHandle.includes('input:file') || e.targetHandle.includes('input:video'))
    );
    if (!incomingEdge) return null;
    const sourceNode = allNodes.find((n) => n.id === incomingEdge.source);
    if (!sourceNode) return null;
    const sourceData = sourceNode.data as unknown as FlowNodeData;
    if (!sourceData.results?.length) return null;
    const result = sourceData.results[sourceData.selectedResultIndex || 0];
    const entry = result?.file;
    if (!entry?.cropW) return null;
    return {
      cropX: entry.cropX as number,
      cropY: entry.cropY as number,
      cropW: entry.cropW as number,
      cropH: entry.cropH as number,
    };
  }, [edges, allNodes, id]);

  // Video refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Video state
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const lastTimeRef = useRef(0);

  // Segments
  const [segments, setSegments] = useState<Segment[]>([]);
  const [undoStack, setUndoStack] = useState<Segment[][]>([]);
  const [redoStack, setRedoStack] = useState<Segment[][]>([]);

  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);

  // Dragging state
  const [dragging, setDragging] = useState<{ type: 'playhead' | 'handle-left' | 'handle-right'; segIdx?: number } | null>(null);
  const draggingHandleRef = useRef(false);

  // Init segments from settings or create default
  useEffect(() => {
    if (!inputUrl) {
      setSegments([]);
      setDuration(0);
      setVideoSize(null);
      return;
    }
    const saved = data.settings.segments as Segment[] | undefined;
    if (saved && saved.length > 0) {
      setSegments(saved);
    }
  }, [inputUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Video frame drawing loop
  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (cropData) {
      canvas.width = cropData.cropW;
      canvas.height = cropData.cropH;
      ctx.drawImage(video, cropData.cropX, cropData.cropY, cropData.cropW, cropData.cropH, 0, 0, cropData.cropW, cropData.cropH);
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    }

    // Don't update playhead position while dragging a handle
    if (!draggingHandleRef.current) {
      const t = Math.floor(video.currentTime * 10) / 10;
      if (t !== lastTimeRef.current) {
        lastTimeRef.current = t;
        setCurrentTime(video.currentTime);
      }
    }

    if (!video.paused) {
      const ct = video.currentTime;
      // Find which segment we're currently in
      const curSegIdx = segments.findIndex(s => ct >= s.start - 0.02 && ct <= s.end + 0.02);
      if (curSegIdx === -1 && segments.length > 0) {
        // We've left a segment — find the next one
        const nextSeg = segments.find(s => s.start > ct - 0.05);
        if (nextSeg) {
          video.currentTime = nextSeg.start;
          setCurrentTime(nextSeg.start);
        } else {
          // Past the last segment — stop
          video.pause();
          setIsPlaying(false);
        }
      } else if (curSegIdx >= 0 && ct > segments[curSegIdx].end - 0.02) {
        // At the end of current segment — jump to next
        const nextSeg = segments[curSegIdx + 1];
        if (nextSeg) {
          video.currentTime = nextSeg.start;
          setCurrentTime(nextSeg.start);
        } else {
          video.pause();
          setIsPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [segments, cropData]);

  useEffect(() => {
    if (!inputUrl || !videoSize) return;
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [inputUrl, videoSize, drawFrame]);

  useEffect(() => {
    const tc = thumbCanvasRef.current;
    const container = timelineRef.current;
    if (!inputUrl || !duration || !tc || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerW = container.offsetWidth;
    const STRIP_H = 50;

    // Fixed frame width (~30px) for dense thumbnail strip like Imagine.art
    const frameW = 30;
    const count = Math.ceil(containerW / frameW);
    const step = duration / count;

    // Canvas = exactly container size (no stretch/compress)
    tc.width = containerW * dpr;
    tc.height = STRIP_H * dpr;
    tc.style.width = `${containerW}px`;
    tc.style.height = `${STRIP_H}px`;

    const ctx = tc.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, containerW, STRIP_H);

    let drawn = 0;
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.src = inputUrl;
    v.muted = true;
    v.preload = 'auto';

    const drawNext = () => {
      if (drawn >= count) {
        v.src = '';
        return;
      }
      v.currentTime = step * drawn + step / 2;
    };

    v.onseeked = () => {
      // Each frame occupies frameW in the canvas, drawn without distortion
      const dx = frameW * drawn;
      // Don't draw past the canvas edge
      const drawW = Math.min(frameW, containerW - dx);
      if (drawW <= 0) { drawn++; drawNext(); return; }
      // Source crop to match destination aspect (center crop)
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const srcAspect = vw / vh;
      const dstAspect = frameW / STRIP_H;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (srcAspect > dstAspect) {
        sw = vh * dstAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / dstAspect;
        sy = (vh - sh) / 2;
      }
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
    const dur = video.duration;
    setDuration(dur);
    setVideoSize({ w: video.videoWidth, h: video.videoHeight });
    video.currentTime = 0.001;

    // Init segments if empty
    setSegments(prev => {
      if (prev.length > 0) return prev;
      return [{ id: uid(), start: 0, end: dur }];
    });
  }, []);

  // Save segments to settings when they change
  useEffect(() => {
    if (segments.length === 0 || !duration) return;
    useFlowStore.getState().updateNodeData(id, {
      settings: { ...data.settings, segments, duration },
      status: 'done',
      results: [{
        video: {
          content: inputUrl || '',
          format: 'video',
          segments: JSON.stringify(segments),
          duration,
        },
      }],
      selectedResultIndex: 0,
    });
  }, [segments, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // If current time is outside all segments, jump to first segment
      const inSegment = segments.some(s => video.currentTime >= s.start && video.currentTime <= s.end);
      if (!inSegment && segments.length > 0) {
        const nextSeg = segments.find(s => s.start > video.currentTime) || segments[0];
        video.currentTime = nextSeg.start;
        setCurrentTime(nextSeg.start);
      }
      video.play();
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(drawFrame);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [drawFrame, segments]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Seek on video progress bar
  const handleVideoSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(e.target.value);
    setCurrentTime(video.currentTime);
    if (video.paused) rafRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // Timeline interaction
  const timeToPercent = (t: number) => duration > 0 ? (t / duration) * 100 : 0;

  const getTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const timeline = timelineRef.current;
    if (!timeline || !duration) return 0;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  // Timeline click → move playhead
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    const t = getTimeFromMouseEvent(e);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    setCurrentTime(t);
    if (video.paused) rafRef.current = requestAnimationFrame(drawFrame);
  }, [dragging, getTimeFromMouseEvent, drawFrame]);

  // Drag handling
  useEffect(() => {
    if (!dragging) return;
    const isHandleDrag = dragging.type === 'handle-left' || dragging.type === 'handle-right';
    if (isHandleDrag) draggingHandleRef.current = true;
    const handleMove = (e: MouseEvent) => {
      const t = getTimeFromMouseEvent(e);
      const video = videoRef.current;

      if (dragging.type === 'playhead') {
        if (video) {
          video.currentTime = t;
          setCurrentTime(t);
          if (video.paused) rafRef.current = requestAnimationFrame(drawFrame);
        }
      } else if (dragging.type === 'handle-left' && dragging.segIdx !== undefined) {
        const newStart = Math.max(0, Math.min(t, segments[dragging.segIdx].end - 0.1));
        setSegments(prev => prev.map((s, i) => i === dragging.segIdx ? { ...s, start: newStart } : s));
        // Update video frame to show what's at the edge, but don't move playhead state yet
        if (video) { video.currentTime = newStart; if (video.paused) rafRef.current = requestAnimationFrame(drawFrame); }
      } else if (dragging.type === 'handle-right' && dragging.segIdx !== undefined) {
        const newEnd = Math.min(duration, Math.max(t, segments[dragging.segIdx].start + 0.1));
        setSegments(prev => prev.map((s, i) => i === dragging.segIdx ? { ...s, end: newEnd } : s));
        if (video) { video.currentTime = newEnd; if (video.paused) rafRef.current = requestAnimationFrame(drawFrame); }
      }
    };
    const handleUp = () => {
      const d = dragging;
      draggingHandleRef.current = false;
      setDragging(null);
      // Snap playhead to the edge after releasing handle
      if (d && d.segIdx !== undefined && (d.type === 'handle-left' || d.type === 'handle-right')) {
        const video = videoRef.current;
        const seg = segments[d.segIdx];
        if (seg) {
          const snapTime = d.type === 'handle-left' ? seg.start : seg.end;
          setCurrentTime(snapTime);
          if (video) { video.currentTime = snapTime; if (video.paused) rafRef.current = requestAnimationFrame(drawFrame); }
        }
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, getTimeFromMouseEvent, duration, drawFrame, segments]);

  // Segment operations
  const pushSegmentUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-20), segments]);
    setRedoStack([]);
  }, [segments]);

  const handleSplit = useCallback(() => {
    const t = currentTime;
    const segIdx = segments.findIndex(s => t > s.start && t < s.end);
    if (segIdx === -1) return;
    pushSegmentUndo();
    const seg = segments[segIdx];
    setSegments(prev => [
      ...prev.slice(0, segIdx),
      { id: uid(), start: seg.start, end: t },
      { id: uid(), start: t, end: seg.end },
      ...prev.slice(segIdx + 1),
    ]);
  }, [currentTime, segments, pushSegmentUndo]);

  const handleSplitDeleteLeft = useCallback(() => {
    const t = currentTime;
    const segIdx = segments.findIndex(s => t > s.start && t < s.end);
    if (segIdx === -1) return;
    pushSegmentUndo();
    const seg = segments[segIdx];
    setSegments(prev => [
      ...prev.slice(0, segIdx),
      { ...seg, id: uid(), start: t },
      ...prev.slice(segIdx + 1),
    ]);
  }, [currentTime, segments, pushSegmentUndo]);

  const handleSplitDeleteRight = useCallback(() => {
    const t = currentTime;
    const segIdx = segments.findIndex(s => t > s.start && t < s.end);
    if (segIdx === -1) return;
    pushSegmentUndo();
    const seg = segments[segIdx];
    setSegments(prev => [
      ...prev.slice(0, segIdx),
      { ...seg, id: uid(), end: t },
      ...prev.slice(segIdx + 1),
    ]);
  }, [currentTime, segments, pushSegmentUndo]);

  const handleSegmentUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(prev => [...prev, segments]);
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setSegments(prev);
  }, [undoStack, segments]);

  const handleSegmentRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(prev => [...prev, segments]);
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setSegments(next);
  }, [redoStack, segments]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="group relative flex flex-col items-center gap-1" style={{ width: 480 }}
      onClick={() => selectNode(id)}
    >
      {/* Top info bar */}
      <div className="absolute bottom-full left-0 mb-1 flex w-full flex-row items-center justify-between gap-2 px-1">
        <div className="flex items-center justify-center p-0.5">
          <input
            className="text-[12px] text-zinc-400 bg-transparent border-none outline-none max-w-[180px] truncate nodrag"
            defaultValue={data.name}
            onChange={(e) => {
              useFlowStore.getState().updateNodeData(id, { name: e.target.value });
            }}
          />
        </div>
      </div>

      {/* Card */}
      <div
        className={`
          bg-[#171717] rounded-[24px] border-2 border-[#212121] relative flex flex-col items-start
          p-4 pt-3 w-full
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
        `}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Scissors size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Trim Video
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
                    backgroundColor: isConnected ? HANDLE_COLORS[handle.type] : '#171717',
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
                    backgroundColor: isConnected ? HANDLE_COLORS[handle.type] : '#171717',
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
              <div className="bg-[#212121] rounded-2xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  src={inputUrl}
                  className="hidden"
                  muted={isMuted}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={onVideoLoaded}
                  onEnded={() => setIsPlaying(false)}
                />
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto"
                  style={cropData ? { aspectRatio: `${cropData.cropW}/${cropData.cropH}` } : videoSize ? { aspectRatio: `${videoSize.w}/${videoSize.h}` } : undefined}
                />
                {/* Video overlay controls */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 flex flex-col gap-1 nodrag">
                  <input
                    type="range"
                    className="w-full h-1 accent-white cursor-pointer"
                    min={0}
                    max={duration || 0}
                    step={0.01}
                    value={currentTime}
                    onChange={handleVideoSeek}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      className="text-white hover:text-zinc-300 transition-colors"
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      className="text-white hover:text-zinc-300 transition-colors"
                      onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <span className="text-[10px] text-zinc-300">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex flex-col gap-2">
                {/* Timeline bar */}
                <div
                  ref={timelineRef}
                  className="relative h-[50px] bg-[#212121] overflow-hidden cursor-pointer nodrag nopan"
                  onClick={handleTimelineClick}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* Thumbnail strip — single canvas */}
                  <canvas
                    ref={thumbCanvasRef}
                    className="absolute inset-0"
                  />

                  {/* Dimmed regions (outside segments) */}
                  {segments.map((seg, i) => {
                    const prevEnd = i === 0 ? 0 : segments[i - 1].end;
                    if (seg.start <= prevEnd) return null;
                    return (
                      <div
                        key={`dim-${i}`}
                        className="absolute top-0 bottom-0 bg-black/60"
                        style={{ left: `${timeToPercent(prevEnd)}%`, width: `${timeToPercent(seg.start) - timeToPercent(prevEnd)}%` }}
                      />
                    );
                  })}
                  {segments.length > 0 && (
                    <div
                      className="absolute top-0 bottom-0 bg-black/60"
                      style={{ left: `${timeToPercent(segments[segments.length - 1].end)}%`, right: 0 }}
                    />
                  )}
                  {segments.length > 0 && segments[0].start > 0 && (
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-black/60"
                      style={{ width: `${timeToPercent(segments[0].start)}%` }}
                    />
                  )}

                  {/* Segment borders & handles — only active segment gets border + handles */}
                  {segments.map((seg, i) => {
                    const isBeingDragged = dragging && (dragging.type === 'handle-left' || dragging.type === 'handle-right') && dragging.segIdx === i;
                    const isActive = isBeingDragged || (currentTime >= seg.start - 0.05 && currentTime <= seg.end + 0.05);
                    return (
                    <div
                      key={seg.id}
                      className="absolute top-0 bottom-0 border"
                      style={{
                        left: `${timeToPercent(seg.start)}%`,
                        width: `${timeToPercent(seg.end) - timeToPercent(seg.start)}%`,
                        borderColor: isActive ? '#999' : 'transparent',
                      }}
                    >
                      {/* Left handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-[8px] cursor-ew-resize hover:bg-[#bbb] z-20 flex items-center justify-center"
                        style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none', backgroundColor: isActive ? '#999' : 'transparent' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          pushSegmentUndo();
                          setDragging({ type: 'handle-left', segIdx: i });
                        }}
                      >
                        <div className="w-[2px] h-3 bg-[#555] rounded-full" />
                      </div>
                      {/* Right handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-[8px] cursor-ew-resize hover:bg-[#bbb] z-20 flex items-center justify-center"
                        style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none', backgroundColor: isActive ? '#999' : 'transparent' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          pushSegmentUndo();
                          setDragging({ type: 'handle-right', segIdx: i });
                        }}
                      >
                        <div className="w-[2px] h-3 bg-[#555] rounded-full" />
                      </div>
                    </div>
                  );
                  })}

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 z-30 cursor-grab"
                    style={{
                      left: `${timeToPercent(currentTime)}%`,
                      transform: 'translateX(-50%)',
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragging({ type: 'playhead' });
                    }}
                  >
                    <div className="w-[10px] h-[10px] rounded-full bg-white mx-auto -mt-[2px]" />
                    <div className="w-[2px] h-full bg-white mx-auto" />
                  </div>
                </div>

                {/* Time labels */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
                  <span>{formatTime(segments[0]?.start ?? 0)}</span>
                  <span className="text-zinc-300 font-medium">{formatTime(currentTime)}</span>
                  <span>{formatTime(segments[segments.length - 1]?.end ?? duration)}</span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-zinc-400 hover:text-white transition-colors nodrag"
                    onClick={(e) => { e.stopPropagation(); handleSplitDeleteLeft(); }}
                    title="Split & delete left"
                  >
                    <ArrowLeftToLine size={14} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-zinc-400 hover:text-white transition-colors nodrag"
                    onClick={(e) => { e.stopPropagation(); handleSplit(); }}
                    title="Split at playhead"
                  >
                    <SplitSquareHorizontal size={14} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-[#2a2a2a] text-zinc-400 hover:text-white transition-colors nodrag"
                    onClick={(e) => { e.stopPropagation(); handleSplitDeleteRight(); }}
                    title="Split & delete right"
                  >
                    <ArrowRightToLine size={14} />
                  </button>
                  <div className="w-px h-4 bg-[#333] mx-1" />
                  <button
                    className={`p-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors nodrag ${undoStack.length > 0 ? 'text-zinc-400 hover:text-white' : 'text-zinc-600'}`}
                    onClick={(e) => { e.stopPropagation(); handleSegmentUndo(); }}
                    disabled={undoStack.length === 0}
                    title="Undo"
                  >
                    <Undo2 size={14} />
                  </button>
                  <button
                    className={`p-1.5 rounded-lg hover:bg-[#2a2a2a] transition-colors nodrag ${redoStack.length > 0 ? 'text-zinc-400 hover:text-white' : 'text-zinc-600'}`}
                    onClick={(e) => { e.stopPropagation(); handleSegmentRedo(); }}
                    disabled={redoStack.length === 0}
                    title="Redo"
                  >
                    <Redo2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect a video input</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
