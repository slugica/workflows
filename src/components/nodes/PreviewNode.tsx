'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { ScanLine, Play, Pause } from 'lucide-react';

export function PreviewNode(props: NodeProps) {
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
  const isVideo = resolved?.mediaType === 'video';

  // Check for crop metadata from source node
  const cropData = useMemo(() => {
    const incomingEdge = edges.find(
      (e) => e.target === id && e.targetHandle &&
        (e.targetHandle.includes('input:image') || e.targetHandle.includes('input:file') || e.targetHandle.includes('input:video'))
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
      naturalW: entry.naturalW as number,
      naturalH: entry.naturalH as number,
    };
  }, [edges, allNodes, id]);

  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const contentSize = useMemo(() => {
    const w = cropData ? cropData.cropW : imgNatural?.w;
    const h = cropData ? cropData.cropH : imgNatural?.h;
    if (!w || !h) return null;
    const MAX_W = 480, MAX_H = 427;
    const ratio = w / h;
    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch > MAX_H) { ch = MAX_H; cw = ch * ratio; }
    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural, cropData]);

  // Canvas-based video rendering with crop
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const lastTimeRef = useRef(0);

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
      ctx.drawImage(
        video,
        cropData.cropX, cropData.cropY, cropData.cropW, cropData.cropH,
        0, 0, cropData.cropW, cropData.cropH
      );
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
    }

    // Throttle time updates to avoid excessive re-renders
    const t = Math.floor(video.currentTime * 10) / 10;
    if (t !== lastTimeRef.current) {
      lastTimeRef.current = t;
      setCurrentTime(video.currentTime);
    }

    if (!video.paused) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [cropData]);

  // Start/stop animation loop based on play state
  useEffect(() => {
    if (!isVideo || !inputUrl) return;
    // Draw first frame once
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isVideo, inputUrl, drawFrame]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
      // Restart rAF loop
      rafRef.current = requestAnimationFrame(drawFrame);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [drawFrame]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(e.target.value);
    setCurrentTime(video.currentTime);
    // Redraw frame at new position
    if (video.paused) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="group relative flex flex-col items-center gap-1"
      style={{ width: contentSize ? contentSize.w + 36 : 356 }}
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
          <span className="text-white"><ScanLine size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Preview
          </h3>
        </header>

        {/* Input handle */}
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

        {/* Output handle */}
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

        {/* Content */}
        <div className="self-stretch">
          {inputUrl ? (
            <div
              className="bg-[#212121] rounded-2xl overflow-hidden"
              style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
            >
              {isVideo ? (
                <div className="relative w-full h-full">
                  {/* Hidden video element */}
                  <video
                    ref={videoRef}
                    src={inputUrl}
                    className="hidden"
                    muted
                    playsInline
                    preload="auto"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setImgNatural({ w: v.videoWidth, h: v.videoHeight });
                      setDuration(v.duration);
                      // Force load first frame so canvas draws immediately
                      v.currentTime = 0.001;
                    }}
                    onEnded={() => setIsPlaying(false)}
                  />
                  {/* Canvas renders cropped/full video frames */}
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain"
                    style={{
                      aspectRatio: cropData
                        ? `${cropData.cropW}/${cropData.cropH}`
                        : imgNatural ? `${imgNatural.w}/${imgNatural.h}` : undefined,
                    }}
                  />
                  {/* Video controls overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 flex flex-col gap-1 nodrag">
                    <input
                      type="range"
                      className="w-full h-1 accent-white cursor-pointer"
                      min={0}
                      max={duration || 0}
                      step={0.01}
                      value={currentTime}
                      onChange={handleSeek}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        className="text-white hover:text-zinc-300 transition-colors"
                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <span className="text-[10px] text-zinc-300">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={inputUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                  onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}
            </div>
          ) : (
            <div className="aspect-square bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect a file input</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
