'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';

interface FilterValues {
  exposure: number;    // -100..+100, neutral 0
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  tint: number;
}

const DEFAULT_FILTERS: FilterValues = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  shadows: 0,
  tint: 0,
};

const FILTER_DEFS: { key: keyof FilterValues; label: string }[] = [
  { key: 'exposure', label: 'Exposure' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'tint', label: 'Tint' },
];

export function FiltersNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

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

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current); }, []);

  const [filters, setFilters] = useState<FilterValues>({ ...DEFAULT_FILTERS });
  const [committed, setCommitted] = useState<FilterValues>({ ...DEFAULT_FILTERS });
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const contentSize = useMemo(() => {
    if (!imgNatural) return null;
    const MAX_W = 480, MAX_H = 427;
    const ratio = imgNatural.w / imgNatural.h;
    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch > MAX_H) { ch = MAX_H; cw = ch * ratio; }
    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural]);

  // Video path: pass through URL immediately
  useEffect(() => {
    if (!inputUrl || !isVideo) return;
    useFlowStore.getState().updateNodeData(id, {
      status: 'done',
      results: [{ file: { content: inputUrl, format: 'video' } }],
      selectedResultIndex: 0,
    });
  }, [id, inputUrl, isVideo]);

  // Image path: existing canvas + pixel manipulation logic
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

    // CSS filters: -100->0, 0->1, +100->2
    const brightness = 1 + committed.exposure / 100;
    const contrast = 1 + committed.contrast / 100;
    const saturate = 1 + committed.saturation / 100;

    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
    ctx.drawImage(image, 0, 0, nw, nh);

    // Pixel manipulation for temperature, shadows, tint
    const needsPixelPass =
      committed.temperature !== 0 || committed.shadows !== 0 || committed.tint !== 0;

    if (needsPixelPass) {
      const imageData = ctx.getImageData(0, 0, nw, nh);
      const d = imageData.data;

      const tempShift = committed.temperature * 1.5;
      const shadowShift = committed.shadows * 2;
      const tintShift = committed.tint * 0.8;

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];

        // Temperature: warm adds red, removes blue; cool opposite
        r = r + tempShift;
        b = b - tempShift;

        // Tint: positive = magenta (add red + blue, remove green)
        r = r + tintShift * 0.5;
        g = g - tintShift;
        b = b + tintShift * 0.5;

        // Shadows: affect darker pixels more
        const lum = (r + g + b) / 3;
        const shadowFactor = Math.max(0, 1 - lum / 180); // stronger on darks
        r = r + shadowShift * shadowFactor;
        g = g + shadowShift * shadowFactor;
        b = b + shadowShift * shadowFactor;

        d[i] = Math.min(255, Math.max(0, r));
        d[i + 1] = Math.min(255, Math.max(0, g));
        d[i + 2] = Math.min(255, Math.max(0, b));
      }

      ctx.putImageData(imageData, 0, 0);
    }

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
  }, [id, inputUrl, isVideo, committed, imgNatural]);

  const resultUrl = data.results?.[0]
    ? Object.values(data.results[0])[0]?.content
    : null;

  // Persist FFmpeg op for export chain
  useEffect(() => {
    const vFilters: string[] = [];
    const eqParts: string[] = [];
    if (committed.exposure) eqParts.push(`brightness=${(committed.exposure / 100).toFixed(2)}`);
    if (committed.contrast) eqParts.push(`contrast=${(1 + committed.contrast / 100).toFixed(2)}`);
    if (committed.saturation) eqParts.push(`saturation=${(1 + committed.saturation / 100).toFixed(2)}`);
    if (eqParts.length > 0) vFilters.push(`eq=${eqParts.join(':')}`);
    const cbParts: string[] = [];
    if (committed.temperature) cbParts.push(`rs=${(committed.temperature / 100).toFixed(2)}:gs=0:bs=${(-committed.temperature / 100).toFixed(2)}`);
    if (committed.tint) cbParts.push(`rm=${(committed.tint / 200).toFixed(2)}:gm=${(-committed.tint / 100).toFixed(2)}:bm=${(committed.tint / 200).toFixed(2)}`);
    if (cbParts.length > 0) vFilters.push(`colorbalance=${cbParts.join(':')}`);
    if (committed.shadows) {
      const s = Math.max(0, Math.min(2, 1 + committed.shadows / 100));
      vFilters.push(`curves=m=0/0 0.25/${(0.25 * s).toFixed(2)} 0.5/0.5 1/1`);
    }
    useFlowStore.getState().updateNodeSetting(id, 'ffmpegOp', vFilters.length > 0 ? { vFilters } : null);
  }, [id, committed]);

  const handleReset = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setCommitted({ ...DEFAULT_FILTERS });
  };

  // CSS filter string for video preview
  const videoCssFilter = `brightness(${1 + committed.exposure / 100}) contrast(${1 + committed.contrast / 100}) saturate(${1 + committed.saturation / 100})`;

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
          <span className="text-white"><SlidersHorizontal size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Filters
          </h3>
        </header>

        {/* Input handles */}
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
                  <span
                    className="handle-label absolute top-[-20px] right-[14px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ color }}
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
                  <span
                    className="handle-label absolute top-[-20px] left-[24px] whitespace-nowrap text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    style={{ color }}
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
            <>
              {/* Hidden source element for dimensions */}
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={inputUrl}
                  className="hidden"
                  crossOrigin="anonymous"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setImgNatural({ w: v.videoWidth, h: v.videoHeight });
                  }}
                />
              ) : (
                <img
                  ref={imgRef}
                  src={inputUrl}
                  alt=""
                  className="hidden"
                  crossOrigin="anonymous"
                  onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}

              {/* Preview */}
              <div
                className="relative bg-[#212121] rounded-2xl overflow-hidden"
                style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
              >
                {isVideo ? (
                  <VideoPreviewPlayer
                    src={inputUrl}
                    className="w-full h-full"
                    videoStyle={{ filter: videoCssFilter }}
                  />
                ) : (
                  <img
                    src={resultUrl || inputUrl}
                    alt="Filters result"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="aspect-square bg-[#212121] rounded-2xl checkerboard" />
          )}

          {/* Reset */}
          <div className="mt-2 flex justify-end self-stretch">
            <button
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors nodrag"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>

          {/* Sliders */}
          <div className="mt-1 space-y-2 self-stretch">
            {FILTER_DEFS.map((def) => (
              <div key={def.key} className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-500 w-[80px] shrink-0">{def.label}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={filters[def.key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [def.key]: Number(e.target.value) }))}
                  onPointerUp={() => setCommitted({ ...filters })}
                  className="flex-1 accent-white h-1 nodrag"
                />
                <span className="text-[11px] text-zinc-400 w-[32px] text-right tabular-nums">
                  {filters[def.key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
