'use client';

import { useCallback, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { ensureRemoteUrl } from '@/lib/executeNode';
import { useFlowStore } from '@/store/flowStore';
import { Scaling, Play, Loader } from 'lucide-react';
import { MediaPreview, type MediaItem } from '@/components/nodes/MediaPreview';
import { NodeQuickActions } from './NodeQuickActions';
import { NodeSelect, NodeLabel } from './controls';
import { theme } from '@/lib/theme';

type AspectRatio = '1:1' | '3:4' | '4:3' | '2:3' | '3:2' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9', '21:9'];

function parseRatio(ratio: AspectRatio): { w: number; h: number } {
  const [w, h] = ratio.split(':').map(Number);
  return { w, h };
}

function getOrientationLabel(ratio: AspectRatio): string {
  const { w, h } = parseRatio(ratio);
  if (w === h) return 'square';
  return w > h ? 'widescreen' : 'portrait';
}

function getSidesLabel(ratio: AspectRatio, origW: number, origH: number): string {
  const { w: rw, h: rh } = parseRatio(ratio);
  const targetRatio = rw / rh;
  const origRatio = origW / origH;
  const wider = targetRatio > origRatio + 0.01;
  const taller = targetRatio < origRatio - 0.01;
  if (wider && taller) return 'all sides';
  if (wider) return 'left and right sides';
  if (taller) return 'top and bottom';
  return 'all sides';
}

function buildPrompt(ratio: AspectRatio, origW: number, origH: number): string {
  const orientation = getOrientationLabel(ratio);
  const sides = getSidesLabel(ratio, origW, origH);
  return `Seamlessly outpaint the uploaded image to exact ${ratio} ${orientation} aspect ratio. \nExtend ${sides} only with perfect matching background, textures, and lighting—no new objects, people, or changes to the original content. \nKeep everything centered, undistorted, and strictly in ${ratio} format.`;
}

export function AiResizeNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    (data.settings.aspectRatio as AspectRatio) || '1:1'
  );
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  const isRunning = data.status === 'running';

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);
  const hasInput = !!inputImageUrl;

  // Calculate preview dimensions: show original image centered in target aspect ratio
  const previewLayout = useMemo(() => {
    if (!imgNatural) return null;
    const { w: rw, h: rh } = parseRatio(aspectRatio);
    const targetRatio = rw / rh;
    const origRatio = imgNatural.w / imgNatural.h;

    const CONTAINER_W = 320;
    // Container matches target aspect ratio
    const containerH = Math.round(CONTAINER_W / targetRatio);

    // Image inside container: fit to fill one dimension
    let imgW: number, imgH: number;
    if (origRatio > targetRatio) {
      // Original is wider than target → image fills width, gaps top/bottom
      imgW = CONTAINER_W;
      imgH = Math.round(CONTAINER_W / origRatio);
    } else {
      // Original is taller than target → image fills height, gaps left/right
      imgH = containerH;
      imgW = Math.round(containerH * origRatio);
    }

    return {
      containerW: CONTAINER_W,
      containerH,
      imgW,
      imgH,
      imgLeft: Math.round((CONTAINER_W - imgW) / 2),
      imgTop: Math.round((containerH - imgH) / 2),
    };
  }, [imgNatural, aspectRatio]);

  const handleRun = async () => {
    if (!inputImageUrl || !imgNatural) return;

    useFlowStore.getState().updateNodeData(id, { status: 'running' });

    const prompt = buildPrompt(aspectRatio, imgNatural.w, imgNatural.h);

    try {
      const remoteUrl = await ensureRemoteUrl(inputImageUrl);
      const res = await fetch('/api/fal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'fal-ai/nano-banana-2/edit',
          input: {
            prompt,
            image_urls: [remoteUrl],
            aspect_ratio: aspectRatio,
            resolution: '2K',
            num_images: 1,
            output_format: 'png',
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);

      const images = json.result?.images || [];
      if (images.length === 0) throw new Error('No output returned');

      const newResults = images.map((img: { url: string }) => ({
        image: { content: img.url, format: 'image' },
      }));

      const currentData = (useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
      const existingResults = (currentData?.results || []).filter(
        r => Object.values(r)[0]?.format !== 'preview'
      );
      const allResults = [...existingResults, ...newResults];

      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: allResults,
        selectedResultIndex: allResults.length - 1,
      });
    } catch (err) {
      useFlowStore.getState().updateNodeData(id, { status: 'idle' });
      useFlowStore.getState().addToast(`AI Resize: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Result display
  const selectedIdx = data.selectedResultIndex || 0;
  const resultEntry = data.results && data.results.length > 0
    ? data.results[selectedIdx]
    : null;
  const resultMeta = resultEntry ? Object.values(resultEntry)[0] : null;
  const isPreview = resultMeta?.format === 'preview';
  const resultUrl = resultMeta && !isPreview ? resultMeta.content : null;

  const previewItems = useMemo((): MediaItem[] => {
    if (!data.results?.length) return [];
    return data.results.map(r => {
      const entry = Object.values(r)[0];
      return {
        content: entry?.content || '',
        format: (entry?.format === 'video' ? 'video' : entry?.format === 'audio' ? 'audio' : 'image') as MediaItem['format'],
        loading: !!entry?.loading,
      };
    });
  }, [data.results]);

  const handlePreviewNavigate = useCallback((idx: number) => {
    useFlowStore.getState().updateNodeData(id, { selectedResultIndex: idx });
  }, [id]);

  const handlePreviewDelete = useCallback((idx: number) => {
    const store = useFlowStore.getState();
    const results = data.results || [];
    const newResults = results.filter((_, i) => i !== idx);
    const newIdx = Math.max(0, Math.min(idx, newResults.length - 1));
    store.updateNodeData(id, {
      results: newResults,
      selectedResultIndex: newIdx,
      ...(newResults.length === 0 ? { status: 'idle' as const } : {}),
    });
  }, [id, data.results]);

  return (
    <NodeQuickActions nodeId={id} selected={selected} data={data}
      className="group relative flex flex-col items-center gap-1"
      style={{ width: 356 }}
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
        <span className="text-[11px] text-white/50">AI Resize</span>
      </div>

      {/* Card */}
      <div
        className={`
          rounded-[24px] border-2 relative flex flex-col items-start
          p-4 pt-3 w-full
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
          ${isRunning ? 'border-yellow-400/50' : ''}
          ${data.status === 'error' ? 'border-red-400/50' : ''}
        `}
        style={{
          backgroundColor: theme.surface1,
          borderColor: selected ? undefined : isRunning ? undefined : data.status === 'error' ? undefined : theme.border1,
        }}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Scaling size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            AI Resize
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

        {/* Output handle */}
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

        {/* Hidden img to get natural dimensions (always present) */}
        {inputImageUrl && (
          <img
            src={inputImageUrl}
            alt=""
            className="hidden"
            crossOrigin="anonymous"
            onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        )}

        {/* Content */}
        <div className="self-stretch">
          {/* Result view */}
          {previewItems.length > 0 ? (
            <MediaPreview
              items={previewItems}
              selectedIndex={data.selectedResultIndex || 0}
              onNavigate={handlePreviewNavigate}
              onDelete={handlePreviewDelete}
              emptyAspectRatio={aspectRatio.replace(':', '/')}
            />
          ) : (
            <MediaPreview
              items={[]}
              selectedIndex={0}
              onNavigate={() => {}}
              onDelete={() => {}}
              emptyState={isRunning ? 'shimmer' : 'checkerboard'}
              emptyAspectRatio={aspectRatio.replace(':', '/')}
            />
          )}

          {/* Aspect Ratio selector */}
          <div className="mt-3 flex items-center gap-2 self-stretch">
            <NodeLabel>Aspect Ratio</NodeLabel>
            <NodeSelect
              fullWidth
              value={aspectRatio}
              onValueChange={(val) => {
                const ar = val as AspectRatio;
                setAspectRatio(ar);
                useFlowStore.getState().updateNodeSetting(id, 'aspectRatio', ar);

                // Add a preview placeholder so the user sees the checkerboard as a new slot
                if (hasInput) {
                  const store = useFlowStore.getState();
                  const currentData = (store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
                  const results = currentData?.results || [];
                  // Remove any existing preview placeholder
                  const cleaned = results.filter(r => Object.values(r)[0]?.format !== 'preview');
                  const preview = { image: { content: '', format: 'preview', aspectRatio: ar } };
                  store.updateNodeData(id, {
                    results: [...cleaned, preview],
                    selectedResultIndex: cleaned.length,
                    status: cleaned.length > 0 ? 'done' : 'idle',
                  });
                }
              }}
              options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
            />
          </div>

          {/* Run button */}
          <div className="mt-3 flex justify-end self-stretch">
            <button
              className={`flex items-center gap-2 h-10 px-3 rounded-2xl text-base font-medium transition-colors nodrag ${
                isRunning
                  ? 'bg-yellow-900/50 text-yellow-400 cursor-wait border border-yellow-700/50'
                  : hasInput && imgNatural
                    ? 'bg-transparent text-white'
                    : 'bg-transparent text-zinc-600 cursor-not-allowed'
              }`}
              style={
                isRunning ? undefined
                : hasInput && imgNatural ? { border: `1px solid ${theme.border2}` }
                : { border: `1px solid ${theme.border1}` }
              }
              disabled={!hasInput || !imgNatural || isRunning}
              onClick={(e) => { e.stopPropagation(); handleRun(); }}
            >
              {isRunning ? <><Loader size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run</>}
            </button>
          </div>
        </div>
      </div>
    </NodeQuickActions>
  );
}
