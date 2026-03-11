'use client';

import { useRef, useMemo, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';
import { IterationCcw, Plus } from 'lucide-react';

const HANDLE_SIZE = 18;
const HEADER_OFFSET = 68;
const CARD_PADDING_BOTTOM = 16;

function getHandleGap(count: number) { return count > 10 ? 6 : count > 6 ? 10 : 24; }
function handlesHeight(count: number) {
  if (count === 0) return 0;
  return count * HANDLE_SIZE + (count - 1) * getHandleGap(count);
}

interface IteratorImage {
  id: string;
  url: string;
  uploading?: boolean;
}

/**
 * Resolve all image URLs connected to this node's input handles.
 */
function resolveAllInputImages(
  nodeId: string,
  allNodes: ReturnType<typeof useNodes>,
  edges: ReturnType<typeof useEdges>,
): { handleId: string; url: string }[] {
  const results: { handleId: string; url: string }[] = [];

  const incomingEdges = edges.filter(
    (e) => e.target === nodeId && e.targetHandle?.includes('input:image')
  );

  for (const edge of incomingEdges) {
    const sourceNode = allNodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const sourceData = sourceNode.data as unknown as FlowNodeData;

    let url: string | null = null;

    if (sourceData.settings.fileUrl) {
      url = sourceData.settings.fileUrl as string;
    } else if (sourceData.results && sourceData.results.length > 0) {
      const sourceHandleKey = edge.sourceHandle?.split(':').pop();
      if (sourceHandleKey) {
        for (const result of sourceData.results) {
          if (result[sourceHandleKey]?.content) {
            url = result[sourceHandleKey].content;
            break;
          }
        }
      }
      if (!url) {
        const result = sourceData.results[sourceData.selectedResultIndex || 0];
        if (result) {
          const entry = Object.values(result)[0];
          if (entry?.content) url = entry.content;
        }
      }
    }

    if (url && edge.targetHandle) {
      results.push({ handleId: edge.targetHandle, url });
    }
  }

  return results;
}

export function ImageIteratorNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputHandles = data.handles.inputs;
  const outputHandles = data.handles.outputs;
  const inputCount = inputHandles.length;

  // Images uploaded directly into the iterator
  const localImages: IteratorImage[] = (data.settings.images as IteratorImage[] | undefined) || [];

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const connectedImages = useMemo(
    () => resolveAllInputImages(id, allNodes, edges),
    [id, allNodes, edges]
  );

  // All images: connected from handles + uploaded locally
  const allImages = useMemo(() => {
    const imgs: { key: string; url: string; uploading?: boolean }[] = [];
    for (const ci of connectedImages) {
      imgs.push({ key: `handle-${ci.handleId}`, url: ci.url });
    }
    for (const li of localImages) {
      imgs.push({ key: `local-${li.id}`, url: li.url, uploading: li.uploading });
    }
    return imgs;
  }, [connectedImages, localImages]);

  const minCardHeight = inputCount > 1
    ? HEADER_OFFSET + handlesHeight(inputCount) + CARD_PADDING_BOTTOM
    : undefined;

  const getImages = useCallback((): IteratorImage[] => {
    const node = useFlowStore.getState().nodes.find(n => n.id === id);
    return ((node?.data as unknown as FlowNodeData)?.settings.images as IteratorImage[] | undefined) || [];
  }, [id]);

  const handleFileSelect = useCallback(async (file: File) => {
    const store = useFlowStore.getState();
    const imageId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);

    store.updateNodeSetting(id, 'images', [
      ...getImages(),
      { id: imageId, url: localUrl, uploading: true },
    ]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/fal/upload', { method: 'POST', body: formData });
      const json = await res.json();

      if (json.url) {
        URL.revokeObjectURL(localUrl);
        store.updateNodeSetting(id, 'images',
          getImages().map(img => img.id === imageId ? { id: imageId, url: json.url } : img)
        );
      } else {
        store.updateNodeSetting(id, 'images', getImages().filter(img => img.id !== imageId));
      }
    } catch {
      store.updateNodeSetting(id, 'images', getImages().filter(img => img.id !== imageId));
    }
  }, [id, getImages]);

  return (
    <div
      className="group relative flex flex-col items-center gap-1"
      style={{ width: 360 }}
      onClick={() => selectNode(id)}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="absolute w-0 h-0 opacity-0 overflow-hidden"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            for (let i = 0; i < files.length; i++) {
              handleFileSelect(files[i]);
            }
          }
          e.target.value = '';
        }}
      />

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
        style={minCardHeight ? { minHeight: minCardHeight } : undefined}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><IterationCcw size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Image Iterator
          </h3>
        </header>

        {/* Input handles */}
        {inputCount > 0 && (
          <div
            className="pointer-events-none absolute top-[68px] -left-[10px] flex flex-col items-center justify-center"
            style={{ gap: `${getHandleGap(inputCount)}px` }}
          >
            {inputHandles.map((handle, i) => {
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
                    Input {i + 1}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Output handle */}
        {outputHandles.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -right-[10px] flex flex-col items-center justify-center gap-6">
            {outputHandles.map((handle, i) => {
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

        {/* Content — image thumbnails grid */}
        <div className="self-stretch">
          {allImages.length > 0 ? (
            <div className={allImages.length === 1 ? '' : 'grid grid-cols-2 gap-2'}>
              {allImages.map((img) => (
                <div key={img.key} className="relative bg-[#212121] rounded-xl overflow-hidden">
                  {img.uploading ? (
                    <div className="shimmer w-full aspect-square" />
                  ) : (
                    <img src={img.url} alt="" className={`w-full ${allImages.length === 1 ? 'rounded-xl' : 'aspect-square object-cover'}`} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              className="bg-[#212121] rounded-2xl p-8 text-center cursor-pointer hover:bg-[#292929] transition-colors nodrag"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer.files;
                for (let i = 0; i < files.length; i++) {
                  if (files[i].type.startsWith('image/')) handleFileSelect(files[i]);
                }
              }}
            >
              <span className="text-zinc-500 text-sm">Drop images or click to upload</span>
            </div>
          )}

          {/* Add Another Image button */}
          <button
            className="mt-3 flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors nodrag"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            <Plus size={14} />
            Add Another Image
          </button>
        </div>
      </div>
    </div>
  );
}
