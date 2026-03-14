'use client';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import * as Slider from '@radix-ui/react-slider';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';
import { NodeQuickActions } from './NodeQuickActions';

type Channel = 'rgb' | 'red' | 'green' | 'blue';

const CHANNELS: { label: string; value: Channel }[] = [
  { label: 'RGB', value: 'rgb' },
  { label: 'Red', value: 'red' },
  { label: 'Green', value: 'green' },
  { label: 'Blue', value: 'blue' },
];

const CHANNEL_COLORS: Record<Channel, string> = {
  rgb: 'rgba(180,180,180,0.6)',
  red: 'rgba(255,80,80,0.6)',
  green: 'rgba(80,200,80,0.6)',
  blue: 'rgba(80,120,255,0.6)',
};

interface LevelValues {
  shadowIn: number;
  gamma: number;
  highlightIn: number;
  shadowOut: number;
  highlightOut: number;
}

type AllChannelLevels = Record<Channel, LevelValues>;

const DEFAULT_LEVEL: LevelValues = {
  shadowIn: 0,
  gamma: 1.0,
  highlightIn: 255,
  shadowOut: 0,
  highlightOut: 255,
};

function defaultAllChannels(): AllChannelLevels {
  return {
    rgb: { ...DEFAULT_LEVEL },
    red: { ...DEFAULT_LEVEL },
    green: { ...DEFAULT_LEVEL },
    blue: { ...DEFAULT_LEVEL },
  };
}

// Photoshop-standard gamma formula: position = shadow + range * 0.5^(1/gamma)
function gammaToSlider(gamma: number, shadowIn: number, highlightIn: number): number {
  const range = highlightIn - shadowIn;
  if (range <= 0) return shadowIn;
  return shadowIn + range * Math.pow(0.5, 1 / gamma);
}

function sliderToGamma(pos: number, shadowIn: number, highlightIn: number): number {
  const range = highlightIn - shadowIn;
  if (range <= 0) return 1;
  const t = (pos - shadowIn) / range;
  if (t <= 0.001) return 9.99;
  if (t >= 0.999) return 0.1;
  // Inverse: gamma = 1 / log2(1/t) = -1 / log2(t)
  const g = -1 / Math.log2(t);
  return Math.round(Math.max(0.1, Math.min(9.99, g)) * 100) / 100;
}

function applyLevelToValue(val: number, lv: LevelValues): number {
  const inRange = lv.highlightIn - lv.shadowIn || 1;
  let v = Math.max(0, Math.min(1, (val - lv.shadowIn) / inRange));
  v = Math.pow(v, 1 / lv.gamma);
  return lv.shadowOut + v * (lv.highlightOut - lv.shadowOut);
}

function drawHistogram(canvas: HTMLCanvasElement, imageData: ImageData, channel: Channel) {
  const { data } = imageData;
  const bins = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    let val: number;
    if (channel === 'red') val = data[i];
    else if (channel === 'green') val = data[i + 1];
    else if (channel === 'blue') val = data[i + 2];
    else val = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    bins[val]++;
  }

  let max = 0;
  for (let i = 1; i < 255; i++) {
    if (bins[i] > max) max = bins[i];
  }
  if (max === 0) max = 1;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  ctx.fillStyle = CHANNEL_COLORS[channel];
  for (let i = 0; i < 256; i++) {
    const h = (bins[i] / max) * ch;
    const x = (i / 255) * cw;
    const w = cw / 256 + 0.5;
    ctx.fillRect(x, ch - h, w, h);
  }
}

const thumbClass = 'block w-3 h-3 bg-white rounded-full border-2 border-zinc-400 cursor-ew-resize focus:outline-none focus:border-white';
const trackClass = 'relative flex-1 h-1 bg-[#333] rounded-full';
const rangeClass = 'absolute h-full bg-zinc-500 rounded-full';

const valToPercent = (v: number) => (v / 255) * 100;
const percentToVal = (pct: number) => Math.round(Math.max(0, Math.min(255, (pct / 100) * 255)));

function isDefaultLevel(lv: LevelValues): boolean {
  return lv.shadowIn === 0 && lv.highlightIn === 255 && lv.shadowOut === 0 && lv.highlightOut === 255 && lv.gamma === 1.0;
}

function isAllDefault(levels: AllChannelLevels): boolean {
  return isDefaultLevel(levels.rgb) && isDefaultLevel(levels.red) && isDefaultLevel(levels.green) && isDefaultLevel(levels.blue);
}

/** Custom 3-thumb slider for Input Levels — gamma thumb auto-moves with shadow/highlight */
function InputLevelsSlider({
  shadowIn, gamma, highlightIn,
  onChange, onCommit,
}: {
  shadowIn: number; gamma: number; highlightIn: number;
  onChange: (s: number, g: number, h: number) => void;
  onCommit: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'shadow' | 'gamma' | 'highlight' | null>(null);

  const gammaPos = gammaToSlider(gamma, shadowIn, highlightIn);

  const getPercent = (clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const handlePointerDown = (which: 'shadow' | 'gamma' | 'highlight') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = which;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const pct = getPercent(e.clientX);
    const val = percentToVal(pct);

    if (draggingRef.current === 'shadow') {
      const s = Math.min(val, highlightIn - 1);
      onChange(s, gamma, highlightIn);
    } else if (draggingRef.current === 'highlight') {
      const h = Math.max(val, shadowIn + 1);
      onChange(shadowIn, gamma, h);
    } else {
      // gamma thumb: constrain between shadow and highlight
      const clamped = Math.max(shadowIn + 1, Math.min(highlightIn - 1, val));
      const newGamma = sliderToGamma(clamped, shadowIn, highlightIn);
      onChange(shadowIn, newGamma, highlightIn);
    }
  };

  const handlePointerUp = () => {
    if (draggingRef.current) {
      draggingRef.current = null;
      onCommit();
    }
  };

  return (
    <div
      className="relative h-4 flex items-center select-none touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div ref={trackRef} className="absolute inset-x-0 h-1 bg-[#333] rounded-full">
        <div
          className="absolute h-full bg-zinc-500 rounded-full"
          style={{ left: `${valToPercent(shadowIn)}%`, right: `${100 - valToPercent(highlightIn)}%` }}
        />
      </div>
      {/* Shadow thumb */}
      <div
        className={`absolute w-3 h-3 bg-white rounded-full border-2 border-zinc-400 cursor-ew-resize -translate-x-1/2 z-10 hover:border-white`}
        style={{ left: `${valToPercent(shadowIn)}%` }}
        onPointerDown={handlePointerDown('shadow')}
      />
      {/* Gamma thumb */}
      <div
        className={`absolute w-3 h-3 bg-zinc-400 rounded-full border-2 border-zinc-500 cursor-ew-resize -translate-x-1/2 z-10 hover:border-white`}
        style={{ left: `${valToPercent(gammaPos)}%` }}
        onPointerDown={handlePointerDown('gamma')}
      />
      {/* Highlight thumb */}
      <div
        className={`absolute w-3 h-3 bg-white rounded-full border-2 border-zinc-400 cursor-ew-resize -translate-x-1/2 z-10 hover:border-white`}
        style={{ left: `${valToPercent(highlightIn)}%` }}
        onPointerDown={handlePointerDown('highlight')}
      />
    </div>
  );
}

export function LevelsNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement>(null);
  const histCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const [channel, setChannel] = useState<Channel>('rgb');
  const [allLevels, setAllLevels] = useState<AllChannelLevels>(defaultAllChannels);
  const [committedLevels, setCommittedLevels] = useState<AllChannelLevels>(defaultAllChannels);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const sourceImageDataRef = useRef<ImageData | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Current channel's levels
  const levels = allLevels[channel];
  const setLevels = useCallback((updater: LevelValues | ((prev: LevelValues) => LevelValues)) => {
    setAllLevels((prev) => ({
      ...prev,
      [channel]: typeof updater === 'function' ? updater(prev[channel]) : updater,
    }));
  }, [channel]);

  const contentSize = useMemo(() => {
    if (!imgNatural) return null;
    const MAX_W = 480, MAX_H = 427;
    const ratio = imgNatural.w / imgNatural.h;
    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch > MAX_H) { ch = MAX_H; cw = ch * ratio; }
    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural]);

  // For video input, extract a frame for histogram
  // Fetch as blob to avoid CORS tainting the canvas
  useEffect(() => {
    if (!inputUrl || !isVideo) {
      setThumbnailUrl(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;

    (async () => {
      try {
        // Fetch video as blob so we get a same-origin URL
        const res = await fetch(inputUrl);
        const blob = await res.blob();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);

        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.src = blobUrl;

        video.onloadeddata = () => {
          video.onseeked = () => {
            if (cancelled) return;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')!.drawImage(video, 0, 0);
            setThumbnailUrl(canvas.toDataURL('image/png'));
            setImgNatural({ w: video.videoWidth, h: video.videoHeight });
            video.src = '';
          };
          video.currentTime = 0.1;
        };
      } catch {
        // Silently fail — histogram just won't show
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [inputUrl, isVideo]);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      sourceImageDataRef.current = ctx.getImageData(0, 0, c.width, c.height);
      if (histCanvasRef.current) drawHistogram(histCanvasRef.current, sourceImageDataRef.current, channel);
    }
  }, []);

  useEffect(() => {
    if (!histCanvasRef.current || !sourceImageDataRef.current) return;
    drawHistogram(histCanvasRef.current, sourceImageDataRef.current, channel);
  }, [channel, imgNatural]);

  const gammaSliderPos = gammaToSlider(levels.gamma, levels.shadowIn, levels.highlightIn);

  const prevBlobUrlRef = useRef<string | null>(null);

  // Persist FFmpeg op for export chain
  useEffect(() => {
    if (isAllDefault(committedLevels)) {
      useFlowStore.getState().updateNodeSetting(id, 'ffmpegOp', null);
      return;
    }
    // Convert levels to FFmpeg curves filter per channel
    // curves format: r='sIn/sOut midIn/midOut hIn/hOut':g='...':b='...'
    const buildCurve = (lv: LevelValues) => {
      const sIn = (lv.shadowIn / 255).toFixed(3);
      const sOut = (lv.shadowOut / 255).toFixed(3);
      const hIn = (lv.highlightIn / 255).toFixed(3);
      const hOut = (lv.highlightOut / 255).toFixed(3);
      // Mid-point with gamma: input=0.5 of range, output = gamma-corrected
      const midIn = ((lv.shadowIn + (lv.highlightIn - lv.shadowIn) * 0.5) / 255).toFixed(3);
      const midVal = Math.pow(0.5, 1 / lv.gamma);
      const midOut = ((lv.shadowOut + (lv.highlightOut - lv.shadowOut) * midVal) / 255).toFixed(3);
      return `${sIn}/${sOut} ${midIn}/${midOut} ${hIn}/${hOut}`;
    };
    const parts: string[] = [];
    const rgb = committedLevels.rgb;
    const r = committedLevels.red;
    const g = committedLevels.green;
    const b = committedLevels.blue;
    // Apply RGB master + per-channel as chained curves
    if (!isDefaultLevel(rgb)) parts.push(`curves=m='${buildCurve(rgb)}'`);
    const perChannel: string[] = [];
    if (!isDefaultLevel(r)) perChannel.push(`r='${buildCurve(r)}'`);
    if (!isDefaultLevel(g)) perChannel.push(`g='${buildCurve(g)}'`);
    if (!isDefaultLevel(b)) perChannel.push(`b='${buildCurve(b)}'`);
    if (perChannel.length > 0) parts.push(`curves=${perChannel.join(':')}`);
    if (parts.length > 0) {
      useFlowStore.getState().updateNodeSetting(id, 'ffmpegOp', { vFilters: parts });
    }
  }, [id, committedLevels]);

  // Video path: pass through URL immediately
  useEffect(() => {
    if (!inputUrl || !isVideo) return;
    useFlowStore.getState().updateNodeData(id, {
      status: 'done',
      results: [{ file: { content: inputUrl, format: 'video' } }],
      selectedResultIndex: 0,
    });
  }, [id, inputUrl, isVideo]);

  // Image path: existing pixel manipulation logic
  useEffect(() => {
    if (!inputUrl || isVideo) return;
    if (!imgRef.current || !imgNatural) return;

    const image = imgRef.current;
    const { naturalWidth: nw, naturalHeight: nh } = image;
    if (nw === 0 || nh === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, 0, 0, nw, nh);
    const imageData = ctx.getImageData(0, 0, nw, nh);
    const d = imageData.data;

    const rgb = committedLevels.rgb;
    const red = committedLevels.red;
    const green = committedLevels.green;
    const blue = committedLevels.blue;

    for (let i = 0; i < d.length; i += 4) {
      // Apply RGB levels to all channels first
      let r = applyLevelToValue(d[i], rgb);
      let g = applyLevelToValue(d[i + 1], rgb);
      let b = applyLevelToValue(d[i + 2], rgb);

      // Then apply per-channel levels
      r = applyLevelToValue(r, red);
      g = applyLevelToValue(g, green);
      b = applyLevelToValue(b, blue);

      d[i] = Math.max(0, Math.min(255, Math.round(r)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }

    ctx.putImageData(imageData, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
      const url = URL.createObjectURL(blob);
      prevBlobUrlRef.current = url;
      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: [{ file: { content: url, format: 'image' } }],
        selectedResultIndex: 0,
      });
    }, 'image/png');
  }, [id, inputUrl, isVideo, committedLevels, imgNatural]);

  const resultUrl = data.results?.[0]
    ? Object.values(data.results[0])[0]?.content
    : null;
  const resultFormat = data.results?.[0]
    ? Object.values(data.results[0])[0]?.format
    : null;

  // Reset only current channel
  const handleReset = () => {
    setAllLevels((prev) => ({ ...prev, [channel]: { ...DEFAULT_LEVEL } }));
    setCommittedLevels((prev) => ({ ...prev, [channel]: { ...DEFAULT_LEVEL } }));
  };

  const commitLevels = () => setCommittedLevels({ ...allLevels });

  // Determine the image source for the hidden <img> used for histogram
  const histogramImgSrc = isVideo ? thumbnailUrl : inputUrl;

  // SVG filter for per-channel video preview
  const svgFilterId = `levels-${id}`;
  const buildTable = (channelKey: 'red' | 'green' | 'blue') => {
    const rgb = committedLevels.rgb;
    const ch = committedLevels[channelKey];
    const STEPS = 32;
    const values: number[] = [];
    for (let i = 0; i <= STEPS; i++) {
      let v = (i / STEPS) * 255;
      v = applyLevelToValue(v, rgb);
      v = applyLevelToValue(v, ch);
      values.push(Math.max(0, Math.min(1, v / 255)));
    }
    return values.map(v => v.toFixed(4)).join(' ');
  };

  return (
    <NodeQuickActions nodeId={id} selected={selected} data={data}
      className="group relative flex flex-col items-center gap-1"
      style={{ width: contentSize ? contentSize.w + 36 : 480 }}
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
          <span className="text-white"><SlidersHorizontal size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Levels
          </h3>
        </header>

        {/* Handles */}
        {data.handles.inputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -left-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.inputs.map((handle, i) => {
              const isConnected = connectedHandles.has(handle.id);
              const color = handle.type === 'file' ? resolveFileHandleColor('input', data, handle.id, edges, id, allNodes) : HANDLE_COLORS[handle.type];
              return (
                <Handle
                  key={handle.id || i}
                  type="target"
                  position={Position.Left}
                  id={handle.id}
                  className="!relative !transform-none !w-[18px] !h-[18px] !rounded-full !border-2 !left-0 !top-0 !flex !items-center !justify-center"
                  style={{
                    backgroundColor: isConnected ? color : '#171717',
                    borderColor: color,
                  }}
                >
                  <span className="handle-label absolute top-[-20px] right-[14px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" style={{ color }}>
                    {handle.label}{handle.required ? ' *' : ''}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}
        {data.handles.outputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -right-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.outputs.map((handle, i) => {
              const isConnected = connectedHandles.has(handle.id);
              const color = handle.type === 'file' ? resolveFileHandleColor('output', data, handle.id, edges, id, allNodes) : HANDLE_COLORS[handle.type];
              return (
                <Handle
                  key={handle.id || i}
                  type="source"
                  position={Position.Right}
                  id={handle.id}
                  className="!relative !transform-none !w-[18px] !h-[18px] !rounded-full !border-2 !left-0 !top-0 !flex !items-center !justify-center"
                  style={{
                    backgroundColor: isConnected ? color : '#171717',
                    borderColor: color,
                  }}
                >
                  <span className="handle-label absolute top-[-20px] left-[24px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" style={{ color }}>
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
            <>
              {/* Hidden image for histogram computation */}
              {histogramImgSrc && (
                <img ref={imgRef} src={histogramImgSrc} alt="" className="hidden" crossOrigin="anonymous" onLoad={onImgLoad} />
              )}

              {/* Preview area */}
              <div className="relative bg-[#212121] rounded-2xl overflow-hidden" style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}>
                {isVideo ? (
                  <VideoPreviewPlayer
                    src={inputUrl}
                    className="w-full h-full"
                    videoStyle={{ filter: `url(#${svgFilterId})` }}
                  >
                    <svg width="0" height="0" style={{ position: 'absolute' }}>
                      <filter id={svgFilterId}>
                        <feComponentTransfer>
                          <feFuncR type="table" tableValues={buildTable('red')} />
                          <feFuncG type="table" tableValues={buildTable('green')} />
                          <feFuncB type="table" tableValues={buildTable('blue')} />
                        </feComponentTransfer>
                      </filter>
                    </svg>
                  </VideoPreviewPlayer>
                ) : (
                  <img src={resultUrl || inputUrl} alt="Levels result" className="w-full h-full object-cover" />
                )}
              </div>
            </>
          ) : (
            <div className="aspect-square bg-[#212121] rounded-2xl checkerboard" />
          )}

          {/* Channel selector + Reset */}
          <div className="mt-3 flex items-center gap-2 self-stretch">
            <select
              className="flex-1 bg-[#212121] text-zinc-300 text-xs rounded-lg px-3 py-2 border border-[#333] focus:outline-none nodrag"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              {CHANNELS.map((ch) => (
                <option key={ch.value} value={ch.value}>{ch.label}</option>
              ))}
            </select>
            <button
              className="p-2 rounded-lg border border-[#333] text-zinc-500 hover:text-zinc-300 transition-colors nodrag"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              title="Reset channel"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Histogram with indicator lines */}
          <div className="mt-2 self-stretch relative">
            <canvas ref={histCanvasRef} width={256} height={48} className="w-full h-12 rounded bg-[#212121] border border-[#333]" />
            {/* Vertical indicator lines from thumbs */}
            <div className="absolute inset-0 pointer-events-none" style={{ margin: '1px' }}>
              <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${(levels.shadowIn / 255) * 100}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: `${(gammaSliderPos / 255) * 100}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${(levels.highlightIn / 255) * 100}%` }} />
            </div>
          </div>

          {/* Input Levels: custom 3-thumb slider */}
          <div className="mt-2 self-stretch nodrag" onPointerDown={(e) => e.stopPropagation()}>
            <InputLevelsSlider
              shadowIn={levels.shadowIn}
              gamma={levels.gamma}
              highlightIn={levels.highlightIn}
              onChange={(s, g, h) => setLevels({ ...levels, shadowIn: s, gamma: g, highlightIn: h })}
              onCommit={() => commitLevels()}
            />

            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                className="text-[11px] text-zinc-300 bg-[#212121] rounded-lg px-2 py-1 border border-[#333] w-14 text-center focus:outline-none nodrag [&::-webkit-inner-spin-button]:appearance-none"
                value={levels.shadowIn} min={0} max={254}
                onChange={(e) => setLevels((l) => ({ ...l, shadowIn: Number(e.target.value) }))}
                onBlur={() => commitLevels()}
              />
              <input
                type="number"
                className="text-[11px] text-zinc-300 bg-[#212121] rounded-lg px-2 py-1 border border-[#333] flex-1 text-center focus:outline-none nodrag [&::-webkit-inner-spin-button]:appearance-none"
                value={levels.gamma.toFixed(2)} min={0.1} max={9.99} step={0.01}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setLevels((l) => ({ ...l, gamma: Math.max(0.1, Math.min(9.99, v)) }));
                }}
                onBlur={() => commitLevels()}
              />
              <input
                type="number"
                className="text-[11px] text-zinc-300 bg-[#212121] rounded-lg px-2 py-1 border border-[#333] w-14 text-center focus:outline-none nodrag [&::-webkit-inner-spin-button]:appearance-none"
                value={levels.highlightIn} min={1} max={255}
                onChange={(e) => setLevels((l) => ({ ...l, highlightIn: Number(e.target.value) }))}
                onBlur={() => commitLevels()}
              />
            </div>
          </div>

          {/* Output Levels: 2-thumb slider */}
          <div className="mt-3 self-stretch nodrag" onPointerDown={(e) => e.stopPropagation()}>
            <Slider.Root
              className="relative flex items-center select-none touch-none h-4"
              min={0} max={255} step={1}
              value={[levels.shadowOut, levels.highlightOut]}
              onValueChange={(vals) => setLevels({ ...levels, shadowOut: vals[0], highlightOut: vals[1] })}
              onValueCommit={() => commitLevels()}
            >
              <Slider.Track className={trackClass}>
                <Slider.Range className={rangeClass} />
              </Slider.Track>
              <Slider.Thumb className={thumbClass} aria-label="Output shadows" />
              <Slider.Thumb className={thumbClass} aria-label="Output highlights" />
            </Slider.Root>

            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                className="text-[11px] text-zinc-300 bg-[#212121] rounded-lg px-2 py-1 border border-[#333] w-14 text-center focus:outline-none nodrag [&::-webkit-inner-spin-button]:appearance-none"
                value={levels.shadowOut} min={0} max={255}
                onChange={(e) => setLevels((l) => ({ ...l, shadowOut: Number(e.target.value) }))}
                onBlur={() => commitLevels()}
              />
              <div className="flex-1" />
              <input
                type="number"
                className="text-[11px] text-zinc-300 bg-[#212121] rounded-lg px-2 py-1 border border-[#333] w-14 text-center focus:outline-none nodrag [&::-webkit-inner-spin-button]:appearance-none"
                value={levels.highlightOut} min={0} max={255}
                onChange={(e) => setLevels((l) => ({ ...l, highlightOut: Number(e.target.value) }))}
                onBlur={() => commitLevels()}
              />
            </div>
          </div>
        </div>
      </div>
    </NodeQuickActions>
  );
}
