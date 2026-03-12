'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, type NodeProps } from '@xyflow/react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Crop as CropIcon, Link, Unlink } from 'lucide-react';

const ASPECT_RATIOS: { label: string; value: number | undefined }[] = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

export function CropNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const prevBlobUrlRef = useRef<string | null>(null);
  const { getZoom } = useReactFlow();

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

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspectRatioIdx, setAspectRatioIdx] = useState(0);
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const restoredRef = useRef(false);

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current); }, []);

  useEffect(() => {
    setCrop(undefined);
    setCompletedCrop(null);
    setVideoSize(null);
    restoredRef.current = false;
  }, [inputUrl]);

  // Video: rAF loop to draw frames onto canvas (ReactCrop overlays on top)
  const drawVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(drawVideoFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    rafRef.current = requestAnimationFrame(drawVideoFrame);
  }, []);

  useEffect(() => {
    if (!isVideo || !inputUrl) return;
    rafRef.current = requestAnimationFrame(drawVideoFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isVideo, inputUrl, drawVideoFrame]);

  // Restore saved crop from settings, or use default 15% inset
  const restoreCropForDisplay = useCallback((displayW: number, displayH: number, naturalW: number, naturalH: number) => {
    const saved = data.settings as Record<string, unknown>;
    if (saved.cropXPct != null && !restoredRef.current) {
      restoredRef.current = true;
      const restored: PixelCrop = {
        x: (saved.cropXPct as number) * displayW,
        y: (saved.cropYPct as number) * displayH,
        width: (saved.cropWPct as number) * displayW,
        height: (saved.cropHPct as number) * displayH,
        unit: 'px',
      };
      setCrop(restored);
      setCompletedCrop(restored);
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true;
    const pad = 0.15;
    const initialCrop: PixelCrop = {
      x: Math.round(displayW * pad),
      y: Math.round(displayH * pad),
      width: Math.round(displayW * (1 - pad * 2)),
      height: Math.round(displayH * (1 - pad * 2)),
      unit: 'px',
    };
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  }, [data.settings]);

  // Set initial crop when image loads (for image mode)
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
    restoreCropForDisplay(width, height, naturalWidth, naturalHeight);
  }, [restoreCropForDisplay]);

  // Set initial crop when video metadata loads
  const onVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setVideoSize({ w: video.videoWidth, h: video.videoHeight });
  }, []);

  // When videoSize is set, restore or calculate initial crop
  useEffect(() => {
    if (!videoSize || !canvasRef.current) return;
    const canvas = canvasRef.current;
    requestAnimationFrame(() => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      restoreCropForDisplay(width, height, videoSize.w, videoSize.h);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSize]);

  const presetAspect = ASPECT_RATIOS[aspectRatioIdx].value;
  const aspectRatio = presetAspect ?? (lockedRatio !== null ? lockedRatio : undefined);

  // Get the reference element for dimension calculations
  const getRefElement = () => isVideo ? canvasRef.current : imgRef.current;
  const getNaturalSize = () => {
    if (isVideo && videoSize) return { w: videoSize.w, h: videoSize.h };
    if (!isVideo && imgRef.current) return { w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight };
    return null;
  };
  const getDisplaySize = () => {
    const el = getRefElement();
    if (!el) return null;
    if (isVideo) {
      const rect = el.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    }
    return { w: (el as HTMLImageElement).width, h: (el as HTMLImageElement).height };
  };

  // Real pixel dimensions of the current crop
  const displaySize = getDisplaySize();
  const naturalSize = getNaturalSize();
  const realW = completedCrop && displaySize && naturalSize
    ? Math.round(completedCrop.width * (naturalSize.w / displaySize.w))
    : 0;
  const realH = completedCrop && displaySize && naturalSize
    ? Math.round(completedCrop.height * (naturalSize.h / displaySize.h))
    : 0;

  const handleDimensionChange = useCallback((axis: 'w' | 'h', value: number) => {
    const display = getDisplaySize();
    const natural = getNaturalSize();
    if (!display || !natural || !completedCrop) return;

    const scaleX = natural.w / display.w;
    const scaleY = natural.h / display.h;

    let newW = axis === 'w' ? value / scaleX : completedCrop.width;
    let newH = axis === 'h' ? value / scaleY : completedCrop.height;

    if (lockedRatio && completedCrop.width > 0 && completedCrop.height > 0) {
      const ratio = completedCrop.width / completedCrop.height;
      if (axis === 'w') {
        newH = newW / ratio;
      } else {
        newW = newH * ratio;
      }
    }

    newW = Math.min(newW, display.w);
    newH = Math.min(newH, display.h);

    const newCrop: PixelCrop = {
      x: Math.max(0, (display.w - newW) / 2),
      y: Math.max(0, (display.h - newH) / 2),
      width: newW,
      height: newH,
      unit: 'px',
    };
    setCrop(newCrop);
    setCompletedCrop(newCrop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCrop, lockedRatio, isVideo, videoSize]);

  // Recalculate crop when aspect ratio changes
  useEffect(() => {
    const display = getDisplaySize();
    if (!display || !display.w || !display.h) return;
    const { w: width, h: height } = display;

    if (!aspectRatio) {
      const full: PixelCrop = { x: 0, y: 0, width, height, unit: 'px' };
      setCrop(full);
      setCompletedCrop(full);
    } else {
      let cropW = width;
      let cropH = width / aspectRatio;
      if (cropH > height) {
        cropH = height;
        cropW = height * aspectRatio;
      }
      const newCrop: PixelCrop = {
        x: (width - cropW) / 2,
        y: (height - cropH) / 2,
        width: cropW,
        height: cropH,
        unit: 'px',
      };
      setCrop(newCrop);
      setCompletedCrop(newCrop);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]);

  // Output result when crop changes + persist crop position to settings
  useEffect(() => {
    if (!completedCrop || !inputUrl) return;

    const natural = getNaturalSize();
    const display = getDisplaySize();
    if (!natural || !display) return;

    const scaleX = natural.w / display.w;
    const scaleY = natural.h / display.h;

    const cropX = Math.round(completedCrop.x * scaleX);
    const cropY = Math.round(completedCrop.y * scaleY);
    const cropW = Math.round(completedCrop.width * scaleX);
    const cropH = Math.round(completedCrop.height * scaleY);
    if (cropW === 0 || cropH === 0) return;

    // Save crop as percentages so it survives reload
    const cropSettings = {
      cropXPct: completedCrop.x / display.w,
      cropYPct: completedCrop.y / display.h,
      cropWPct: completedCrop.width / display.w,
      cropHPct: completedCrop.height / display.h,
    };

    if (isVideo) {
      // For video: pass original URL + crop coords for canvas-based crop in Preview
      useFlowStore.getState().updateNodeData(id, {
        settings: { ...data.settings, ...cropSettings },
        status: 'done',
        results: [{
          file: {
            content: inputUrl,
            format: 'video',
            cropX,
            cropY,
            cropW,
            cropH,
            naturalW: natural.w,
            naturalH: natural.h,
          },
        }],
        selectedResultIndex: 0,
      });
    } else {
      // For image: canvas crop
      if (!imgRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(imgRef.current, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        prevBlobUrlRef.current = url;
        useFlowStore.getState().updateNodeData(id, {
          settings: { ...data.settings, ...cropSettings },
          status: 'done',
          results: [{ file: { content: url, format: 'image' } }],
          selectedResultIndex: 0,
        });
      }, 'image/png');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, completedCrop, inputUrl, isVideo]);

  const hasInput = !!inputUrl;
  const showSettings = isVideo ? !!videoSize : !!inputUrl;

  return (
    <div
      className="group relative flex flex-col items-center gap-1" style={{ width: 356 }}
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
          <span className="text-white"><CropIcon size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Crop
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

        {/* Content area */}
        <div className="self-stretch relative">
          {hasInput ? (
            <>
              <div
                className="overflow-hidden rounded-2xl relative"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ zoom: 1 / getZoom() }}
              >
                {isVideo ? (
                  <>
                    {/* Hidden video, canvas draws frames, ReactCrop overlays */}
                    <video
                      ref={videoRef}
                      src={inputUrl!}
                      className="hidden"
                      muted
                      loop
                      playsInline
                      autoPlay
                      onLoadedMetadata={onVideoLoaded}
                    />
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={aspectRatio}
                      className="nodrag nopan nowheel !block"
                    >
                      <canvas
                        ref={canvasRef}
                        className="block w-full"
                        style={videoSize ? { aspectRatio: `${videoSize.w}/${videoSize.h}` } : undefined}
                      />
                    </ReactCrop>
                  </>
                ) : (
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspectRatio}
                    className="nodrag nopan nowheel !block"
                  >
                    <img
                      ref={imgRef}
                      src={inputUrl!}
                      alt="Crop source"
                      className="block w-full"
                      crossOrigin="anonymous"
                      onLoad={onImageLoad}
                    />
                  </ReactCrop>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#212121] rounded-2xl checkerboard flex items-center justify-center aspect-square">
              <span className="text-zinc-500 text-sm">Connect a file input</span>
            </div>
          )}
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="mt-3 space-y-2 self-stretch">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-500 w-[70px]">Aspect Ratio</span>
              <select
                className="flex-1 bg-[#212121] text-zinc-300 text-xs rounded-lg px-2 py-1.5 border border-[#333] focus:outline-none nodrag"
                value={aspectRatioIdx}
                onChange={(e) => {
                  setAspectRatioIdx(Number(e.target.value));
                }}
              >
                {ASPECT_RATIOS.map((ar, i) => (
                  <option key={ar.label} value={i}>{ar.label}</option>
                ))}
              </select>
            </div>
            {completedCrop && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-500 w-[70px]">Dimensions</span>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[11px] text-zinc-500">W</span>
                  <input
                    type="number"
                    className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                    value={realW}
                    min={1}
                    max={naturalSize?.w || 9999}
                    onChange={(e) => handleDimensionChange('w', Number(e.target.value))}
                  />
                  <span className="text-[11px] text-zinc-500">H</span>
                  <input
                    type="number"
                    className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                    value={realH}
                    min={1}
                    max={naturalSize?.h || 9999}
                    onChange={(e) => handleDimensionChange('h', Number(e.target.value))}
                  />
                  <button
                    className={`p-1 rounded transition-colors nodrag ${lockedRatio !== null ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (lockedRatio !== null) {
                        setLockedRatio(null);
                      } else if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
                        setLockedRatio(completedCrop.width / completedCrop.height);
                      }
                    }}
                    title={lockedRatio !== null ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  >
                    {lockedRatio !== null ? <Link size={14} /> : <Unlink size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
