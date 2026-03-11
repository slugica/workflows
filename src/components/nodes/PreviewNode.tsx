'use client';

import { useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { ScanLine } from 'lucide-react';

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

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);

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
          {inputImageUrl ? (
            <div
              className="bg-[#212121] rounded-2xl overflow-hidden"
              style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
            >
              <img
                src={inputImageUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
                onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            </div>
          ) : (
            <div className="aspect-square bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect an image input</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
