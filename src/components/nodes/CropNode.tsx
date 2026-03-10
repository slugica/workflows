'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, type NodeProps } from '@xyflow/react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
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
  const { getZoom } = useReactFlow();

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspectRatioIdx, setAspectRatioIdx] = useState(0);
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);

  useEffect(() => {
    setCrop(undefined);
    setCompletedCrop(null);
  }, [inputImageUrl]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const pad = 0.15; // 15% inset from each side → 70% of image
    const initialCrop: PixelCrop = {
      x: Math.round(width * pad),
      y: Math.round(height * pad),
      width: Math.round(width * (1 - pad * 2)),
      height: Math.round(height * (1 - pad * 2)),
      unit: 'px',
    };
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  }, []);

  const presetAspect = ASPECT_RATIOS[aspectRatioIdx].value;
  const aspectRatio = presetAspect ?? (lockedRatio !== null ? lockedRatio : undefined);

  // Real pixel dimensions of the current crop
  const realW = completedCrop && imgRef.current
    ? Math.round(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width))
    : 0;
  const realH = completedCrop && imgRef.current
    ? Math.round(completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height))
    : 0;

  const handleDimensionChange = useCallback((axis: 'w' | 'h', value: number) => {
    if (!imgRef.current || !completedCrop) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

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

    // Clamp to image bounds
    newW = Math.min(newW, img.width);
    newH = Math.min(newH, img.height);

    // Center the crop
    const newCrop: PixelCrop = {
      x: Math.max(0, (img.width - newW) / 2),
      y: Math.max(0, (img.height - newH) / 2),
      width: newW,
      height: newH,
      unit: 'px',
    };
    setCrop(newCrop);
    setCompletedCrop(newCrop);
  }, [completedCrop, lockedRatio]);

  // Recalculate crop when aspect ratio changes
  useEffect(() => {
    if (!imgRef.current) return;
    const { width, height } = imgRef.current;
    if (!width || !height) return;

    if (!aspectRatio) {
      // Free: select full image
      const full: PixelCrop = { x: 0, y: 0, width, height, unit: 'px' };
      setCrop(full);
      setCompletedCrop(full);
    } else {
      // Fit largest centered crop with given aspect ratio
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
  }, [aspectRatio]);

  // Auto-crop: whenever completedCrop changes, produce result immediately
  useEffect(() => {
    if (!imgRef.current || !completedCrop) return;

    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(completedCrop.width * scaleX);
    canvas.height = Math.round(completedCrop.height * scaleY);
    if (canvas.width === 0 || canvas.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      image,
      Math.round(completedCrop.x * scaleX),
      Math.round(completedCrop.y * scaleY),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: [{ file: { content: url, format: 'image' } }],
        selectedResultIndex: 0,
      });
    }, 'image/png');
  }, [id, completedCrop]);

  return (
    <div
      className="group relative flex flex-col items-center gap-1 w-[480px]"
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
                    {handle.label}
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
                    {handle.label}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Content area */}
        <div className="self-stretch">
          {inputImageUrl ? (
            <div
              className="overflow-hidden rounded-2xl"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ zoom: 1 / getZoom() }}
            >
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspectRatio}
                className="nodrag nopan nowheel !block"
              >
                <img
                  ref={imgRef}
                  src={inputImageUrl}
                  alt="Crop source"
                  className="block w-full"
                  crossOrigin="anonymous"
                  onLoad={onImageLoad}
                />
              </ReactCrop>
            </div>
          ) : (
            <div className="h-[320px] bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect an image input</span>
            </div>
          )}
        </div>

        {/* Settings */}
        {inputImageUrl && (
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
            {completedCrop && imgRef.current && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-zinc-500 w-[70px]">Dimensions</span>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[11px] text-zinc-500">W</span>
                  <input
                    type="number"
                    className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                    value={realW}
                    min={1}
                    max={imgRef.current.naturalWidth}
                    onChange={(e) => handleDimensionChange('w', Number(e.target.value))}
                  />
                  <span className="text-[11px] text-zinc-500">H</span>
                  <input
                    type="number"
                    className="text-xs text-zinc-300 bg-[#212121] rounded-lg px-2 py-1.5 border border-[#333] flex-1 text-center w-16 focus:outline-none focus:border-zinc-500 nodrag [&::-webkit-inner-spin-button]:appearance-none"
                    value={realH}
                    min={1}
                    max={imgRef.current.naturalHeight}
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
