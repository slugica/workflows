'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Droplets } from 'lucide-react';

const BLUR_TYPES = [
  { label: 'Gaussian', value: 'gaussian' },
  { label: 'Box', value: 'box' },
];

/** Separable box blur — O(1) per pixel using running sums (horizontal + vertical pass) */
function applyBoxBlur(src: ImageData, radius: number): ImageData {
  const { width, height } = src;
  const r = Math.max(1, Math.round(radius));
  const inp = new Float32Array(src.data);
  const tmp = new Float32Array(inp.length);
  const out = new Float32Array(inp.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      // Init window: [-r, r] clamped
      for (let x = -r; x <= r; x++) {
        const cx = Math.min(Math.max(x, 0), width - 1);
        sum += inp[(y * width + cx) * 4 + c];
      }
      tmp[(y * width) * 4 + c] = sum / (2 * r + 1);

      for (let x = 1; x < width; x++) {
        const addX = Math.min(x + r, width - 1);
        const remX = Math.max(x - r - 1, 0);
        sum += inp[(y * width + addX) * 4 + c] - inp[(y * width + remX) * 4 + c];
        tmp[(y * width + x) * 4 + c] = sum / (2 * r + 1);
      }
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) {
        const cy = Math.min(Math.max(y, 0), height - 1);
        sum += tmp[(cy * width + x) * 4 + c];
      }
      out[x * 4 + c] = sum / (2 * r + 1);

      for (let y = 1; y < height; y++) {
        const addY = Math.min(y + r, height - 1);
        const remY = Math.max(y - r - 1, 0);
        sum += tmp[(addY * width + x) * 4 + c] - tmp[(remY * width + x) * 4 + c];
        out[(y * width + x) * 4 + c] = sum / (2 * r + 1);
      }
    }
  }

  return new ImageData(new Uint8ClampedArray(out), width, height);
}

export function BlurNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement>(null);

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);

  const [blurType, setBlurType] = useState<string>('gaussian');
  const [blurSize, setBlurSize] = useState<number>(5);
  const [committedSize, setCommittedSize] = useState<number>(5);
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

  // Apply blur to canvas — runs on committed values only (slider release, type change, new image)
  useEffect(() => {
    if (!imgRef.current || !imgNatural) return;

    const image = imgRef.current;
    const { naturalWidth: nw, naturalHeight: nh } = image;
    if (nw === 0 || nh === 0) return;

    // Size 0 = no blur, just pass through original
    if (committedSize === 0) {
      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: [{ file: { content: inputImageUrl!, format: 'image' } }],
        selectedResultIndex: 0,
      });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (blurType === 'gaussian') {
      const pad = committedSize * 3;
      const bigCanvas = document.createElement('canvas');
      bigCanvas.width = nw + pad * 2;
      bigCanvas.height = nh + pad * 2;
      const bigCtx = bigCanvas.getContext('2d');
      if (!bigCtx) return;
      bigCtx.filter = `blur(${committedSize}px)`;
      bigCtx.drawImage(image, pad, pad, nw, nh);
      bigCtx.drawImage(image, 0, 0, 1, nh, 0, pad, pad, nh);
      bigCtx.drawImage(image, nw - 1, 0, 1, nh, pad + nw, pad, pad, nh);
      bigCtx.drawImage(image, 0, 0, nw, 1, pad, 0, nw, pad);
      bigCtx.drawImage(image, 0, nh - 1, nw, 1, pad, pad + nh, nw, pad);
      ctx.drawImage(bigCanvas, pad, pad, nw, nh, 0, 0, nw, nh);
    } else {
      ctx.drawImage(image, 0, 0, nw, nh);
      const imageData = ctx.getImageData(0, 0, nw, nh);
      const blurred = applyBoxBlur(imageData, committedSize);
      ctx.putImageData(blurred, 0, 0);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: [{ file: { content: url, format: 'image' } }],
        selectedResultIndex: 0,
      });
    }, 'image/png');
  }, [id, inputImageUrl, blurType, committedSize, imgNatural]);

  const resultUrl = data.results?.[0]
    ? Object.values(data.results[0])[0]?.content
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
          <span className="text-white"><Droplets size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Blur
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
          {inputImageUrl ? (
            <div className="flex flex-col gap-0">
              {/* Hidden source image for canvas processing */}
              <img
                ref={imgRef}
                src={inputImageUrl}
                alt=""
                className="hidden"
                crossOrigin="anonymous"
                onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />

              {/* Show result or original */}
              <div
                className="bg-[#212121] rounded-2xl overflow-hidden"
                style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
              >
                <img
                  src={resultUrl || inputImageUrl}
                  alt="Blur result"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Controls */}
              <div className="mt-3 flex items-center gap-3 self-stretch">
                <span className="text-[11px] text-zinc-500">Type</span>
                <select
                  className="bg-[#212121] text-zinc-300 text-xs rounded-lg px-2 py-1.5 border border-[#333] focus:outline-none nodrag"
                  value={blurType}
                  onChange={(e) => setBlurType(e.target.value)}
                >
                  {BLUR_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                  ))}
                </select>
                <span className="text-[11px] text-zinc-500">Size</span>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={blurSize}
                  onChange={(e) => setBlurSize(Number(e.target.value))}
                  onPointerUp={() => setCommittedSize(blurSize)}
                  className="flex-1 accent-white h-1 nodrag"
                />
              </div>
            </div>
          ) : (
            <div className="h-[320px] bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect an image input</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
