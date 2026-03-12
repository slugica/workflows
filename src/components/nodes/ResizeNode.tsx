'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInput } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Scaling, Link, Unlink } from 'lucide-react';

export function ResizeNode(props: NodeProps) {
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

  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [targetW, setTargetW] = useState<number>(0);
  const [targetH, setTargetH] = useState<number>(0);
  const [locked, setLocked] = useState(true);

  // When a new image/video loads, init target dimensions to natural size
  useEffect(() => {
    if (!imgNatural) return;
    setTargetW(imgNatural.w);
    setTargetH(imgNatural.h);
  }, [imgNatural]);

  const contentSize = useMemo(() => {
    if (!imgNatural) return null;
    const MAX_W = 480, MAX_H = 427;
    // Use target dimensions for preview aspect ratio
    const w = targetW || imgNatural.w;
    const h = targetH || imgNatural.h;
    const ratio = w / h;
    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch > MAX_H) { ch = MAX_H; cw = ch * ratio; }
    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural, targetW, targetH]);

  const handleWChange = (val: number) => {
    const w = Math.max(1, val);
    setTargetW(w);
    if (locked && imgNatural && imgNatural.w > 0) {
      setTargetH(Math.round(w * (imgNatural.h / imgNatural.w)));
    }
  };

  const handleHChange = (val: number) => {
    const h = Math.max(1, val);
    setTargetH(h);
    if (locked && imgNatural && imgNatural.h > 0) {
      setTargetW(Math.round(h * (imgNatural.w / imgNatural.h)));
    }
  };

  // Video path: pass through URL immediately
  useEffect(() => {
    if (!inputUrl || !isVideo) return;
    useFlowStore.getState().updateNodeData(id, {
      status: 'done',
      results: [{ file: { content: inputUrl, format: 'video' } }],
      selectedResultIndex: 0,
    });
  }, [id, inputUrl, isVideo]);

  // Image path: existing canvas resize logic
  useEffect(() => {
    if (!inputUrl || isVideo) return;
    if (!imgNatural || targetW === 0 || targetH === 0) return;
    if (!imgRef.current) return;
    const image = imgRef.current;
    if (image.naturalWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, 0, 0, targetW, targetH);

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
  }, [id, inputUrl, isVideo, targetW, targetH, imgNatural]);

  const resultUrl = data.results?.[0]
    ? Object.values(data.results[0])[0]?.content
    : null;
  const resultFormat = data.results?.[0]
    ? Object.values(data.results[0])[0]?.format
    : null;

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
          <span className="text-white"><Scaling size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Resize
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
            <div className="flex flex-col gap-0">
              {/* Hidden source image (for image input) */}
              {!isVideo && (
                <img
                  ref={imgRef}
                  src={inputUrl}
                  alt=""
                  className="hidden"
                  crossOrigin="anonymous"
                  onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                />
              )}

              {/* Hidden source video (for video input) */}
              {isVideo && (
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
              )}

              {/* Preview */}
              <div
                className="relative bg-[#212121] rounded-2xl overflow-hidden"
                style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
              >
                {resultFormat === 'video' || isVideo ? (
                  <video
                    controls
                    muted
                    loop
                    src={resultUrl || inputUrl}
                    className="w-full h-full object-cover nodrag"
                  />
                ) : (
                  <img
                    src={resultUrl || inputUrl}
                    alt="Resize result"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Controls */}
              <div className="mt-3 flex items-center gap-2 self-stretch">
                <span className="text-[11px] text-zinc-500">W</span>
                <input
                  type="number"
                  className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                  value={targetW}
                  min={1}
                  onChange={(e) => handleWChange(Number(e.target.value))}
                />
                <span className="text-[11px] text-zinc-500">H</span>
                <input
                  type="number"
                  className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                  value={targetH}
                  min={1}
                  onChange={(e) => handleHChange(Number(e.target.value))}
                />
                <button
                  className={`p-1 rounded transition-colors nodrag ${locked ? 'text-zinc-300 hover:text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocked(!locked);
                  }}
                  title={locked ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                >
                  {locked ? <Link size={14} /> : <Unlink size={14} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[320px] bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect a file input</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
