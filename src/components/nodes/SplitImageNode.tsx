'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Handle, Position, useEdges, useNodes, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Grid2x2 } from 'lucide-react';
import { NodeQuickActions } from './NodeQuickActions';
import { NodeSelect, NodeLabel } from './controls';
import { theme } from '@/lib/theme';

type GridSize = '2x2' | '3x2' | '3x3' | '4x2' | '4x3' | '4x4' | '5x5';

const GRID_OPTIONS: GridSize[] = ['2x2', '3x2', '3x3', '4x2', '4x3', '4x4', '5x5'];

function parseGrid(grid: GridSize): { cols: number; rows: number } {
  const [cols, rows] = grid.split('x').map(Number);
  return { cols, rows };
}

const HANDLE_SIZE = 18;
const HEADER_OFFSET = 68;
const CARD_PADDING_BOTTOM = 16;
const CONTROLS_HEIGHT = 110;

function getHandleGap(count: number) { return count > 10 ? 6 : count > 6 ? 10 : 24; }
function handlesHeight(count: number) {
  if (count === 0) return 0;
  return count * HANDLE_SIZE + (count - 1) * getHandleGap(count);
}

function GridOverlay({ cols, rows, isDone }: { cols: number; rows: number; isDone: boolean }) {
  const totalCells = cols * rows;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: cols - 1 }, (_, i) => {
        const left = `${((i + 1) / cols) * 100}%`;
        return isDone ? (
          <div key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-black/70" style={{ left }} />
        ) : (
          <svg key={`v${i}`} className="absolute top-0 h-full" style={{ left }} width="2" preserveAspectRatio="none">
            <line x1="1" y1="0" x2="1" y2="100%" stroke="white" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="6 4" />
          </svg>
        );
      })}
      {Array.from({ length: rows - 1 }, (_, i) => {
        const top = `${((i + 1) / rows) * 100}%`;
        return isDone ? (
          <div key={`h${i}`} className="absolute left-0 right-0 h-px bg-black/70" style={{ top }} />
        ) : (
          <svg key={`h${i}`} className="absolute left-0 w-full" style={{ top }} height="2" preserveAspectRatio="none">
            <line x1="0" y1="1" x2="100%" y2="1" stroke="white" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="6 4" />
          </svg>
        );
      })}
      {isDone && Array.from({ length: totalCells }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return (
          <div
            key={`n${i}`}
            className="absolute flex items-center justify-center"
            style={{
              left: `${(c / cols) * 100}%`,
              top: `${(r / rows) * 100}%`,
              width: `${(1 / cols) * 100}%`,
              height: `${(1 / rows) * 100}%`,
            }}
          >
            <span className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-[11px] text-white font-medium">
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SplitImageNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const imgRef = useRef<HTMLImageElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  const [gridSize, setGridSize] = useState<GridSize>('2x2');
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const { cols, rows } = parseGrid(gridSize);
  const totalCells = cols * rows;

  const isDone = data.status === 'done';
  const isRunning = data.status === 'running';
  const outputHandles = isDone ? data.handles.outputs : [];
  const outputCount = outputHandles.length;

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);

  // Force React Flow to recalculate handle positions after they change
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, outputCount, updateNodeInternals]);

  const minCardHeight = isDone && outputCount > 0
    ? HEADER_OFFSET + handlesHeight(outputCount) + CARD_PADDING_BOTTOM
    : undefined;

  const contentSize = useMemo(() => {
    if (!imgNatural) return null;
    const MAX_W = 480;
    const ratio = imgNatural.w / imgNatural.h;
    const minImgH = minCardHeight ? minCardHeight - HEADER_OFFSET - CONTROLS_HEIGHT : 0;

    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch < minImgH) { ch = minImgH; cw = ch * ratio; }

    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural, minCardHeight]);

  const handleGridChange = (newGrid: GridSize) => {
    setGridSize(newGrid);
    if (isDone) {
      useFlowStore.getState().updateNodeData(id, {
        status: 'idle',
        results: [],
        handles: { inputs: data.handles.inputs, outputs: [] },
      });
    }
  };

  const handleRun = async () => {
    if (!imgRef.current || !imgNatural) return;
    const image = imgRef.current;
    const { naturalWidth: nw, naturalHeight: nh } = image;
    if (nw === 0 || nh === 0) return;

    useFlowStore.getState().updateNodeData(id, { status: 'running' });

    const cellW = Math.floor(nw / cols);
    const cellH = Math.floor(nh / rows);

    // 1. Slice image into blobs
    const blobs: Blob[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(image, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png')
        );
        blobs.push(blob);
      }
    }

    // 2. Upload all pieces to fal.ai storage in parallel
    try {
      const urls = await Promise.all(
        blobs.map(async (blob, idx) => {
          const formData = new FormData();
          formData.append('file', blob, `split_${idx + 1}.png`);
          const res = await fetch('/api/fal/upload', { method: 'POST', body: formData });
          if (!res.ok) throw new Error(`Upload failed for piece ${idx + 1}`);
          const { url } = await res.json();
          return url as string;
        })
      );

      const results = urls.map((url, idx) => ({
        [`split_${idx + 1}`]: { content: url, format: 'image' },
      }));

      const outputs = Array.from({ length: totalCells }, (_, i) => ({
        id: `${id}|output:image:split_${i + 1}`,
        key: `split_${i + 1}`,
        label: `Split ${i + 1}`,
        type: 'image' as const,
      }));

      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results,
        selectedResultIndex: 0,
        handles: { inputs: data.handles.inputs, outputs },
      });
    } catch (err) {
      useFlowStore.getState().updateNodeData(id, { status: 'idle' });
      useFlowStore.getState().addToast(`Split Image: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const hasInput = !!inputImageUrl;

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
          rounded-[24px] border-2 relative flex flex-col items-start
          p-4 pt-3 w-full
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
        `}
        style={{
          backgroundColor: theme.surface1,
          borderColor: selected ? undefined : theme.border1,
          ...(minCardHeight ? { minHeight: minCardHeight } : {}),
        }}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Grid2x2 size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Split Image
          </h3>
        </header>

        {/* Input handle */}
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
                    backgroundColor: isConnected ? color : theme.surface1,
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

        {/* Output handles — only after split is done */}
        {outputCount > 0 && (
          <div
            className="pointer-events-none absolute top-[68px] -right-[10px] flex flex-col items-center justify-center"
            style={{ gap: `${getHandleGap(outputCount)}px` }}
          >
            {outputHandles.map((handle, i) => {
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
                    backgroundColor: isConnected ? color : theme.surface1,
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
          {inputImageUrl ? (
            <>
              <img
                ref={imgRef}
                src={inputImageUrl}
                alt=""
                className="hidden"
                crossOrigin="anonymous"
                onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{ ...(contentSize ? { width: contentSize.w, height: contentSize.h } : {}), backgroundColor: theme.previewBg }}
              >
                {isRunning ? (
                  /* Shimmer grid while processing */
                  <div className="w-full h-full grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: '2px' }}>
                    {Array.from({ length: totalCells }, (_, i) => (
                      <div key={i} className="shimmer rounded-sm relative">
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center text-[11px] text-white/60 font-medium">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <img src={inputImageUrl} alt="Split preview" className="w-full h-full object-cover" />
                    <GridOverlay cols={cols} rows={rows} isDone={isDone} />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="relative aspect-square rounded-2xl overflow-hidden" style={{ backgroundColor: theme.previewBg }}>
              <GridOverlay cols={cols} rows={rows} isDone={false} />
            </div>
          )}

          {/* Grid Size selector */}
          <div className="mt-3 flex items-center gap-2 self-stretch">
            <NodeLabel>Grid Size</NodeLabel>
            <NodeSelect
              fullWidth
              value={gridSize}
              onValueChange={(val) => handleGridChange(val as GridSize)}
              options={GRID_OPTIONS.map((g) => ({ value: g, label: g }))}
            />
          </div>

          {/* Run button */}
          <div className="mt-3 flex justify-end self-stretch">
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors nodrag ${
                hasInput && !isRunning
                  ? 'text-zinc-300'
                  : 'text-zinc-600 cursor-not-allowed'
              }`}
              style={{ backgroundColor: theme.surface2 }}
              onMouseOver={(e) => { if (hasInput && !isRunning) e.currentTarget.style.backgroundColor = theme.surfaceHover; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = theme.surface2; }}
              disabled={!hasInput || isRunning}
              onClick={(e) => { e.stopPropagation(); handleRun(); }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
            </button>
          </div>
        </div>
      </div>
    </NodeQuickActions>
  );
}
