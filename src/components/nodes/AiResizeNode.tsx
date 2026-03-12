'use client';

import { useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { ensureRemoteUrl } from '@/lib/executeNode';
import { useFlowStore } from '@/store/flowStore';
import { Scaling, Play, Loader, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

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

    useFlowStore.getState().updateNodeData(id, { status: 'running', errorMessage: '' });

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
      useFlowStore.getState().updateNodeData(id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
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

  return (
    <div
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
          bg-[#171717] rounded-[24px] border-2 border-[#212121] relative flex flex-col items-start
          p-4 pt-3 w-full
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
          ${isRunning ? 'border-yellow-400/50' : ''}
          ${data.status === 'error' ? 'border-red-400/50' : ''}
        `}
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
          {isPreview && inputImageUrl ? (
            <div className="relative">
              {previewLayout ? (
                <div
                  className="relative rounded-2xl overflow-hidden mx-auto"
                  style={{ width: previewLayout.containerW, height: previewLayout.containerH }}
                >
                  {isRunning ? (
                    <div className="shimmer w-full h-full" />
                  ) : (
                    <div className="checkerboard w-full h-full relative">
                      <img
                        src={inputImageUrl}
                        alt="Preview"
                        className="absolute object-cover"
                        style={{
                          left: previewLayout.imgLeft,
                          top: previewLayout.imgTop,
                          width: previewLayout.imgW,
                          height: previewLayout.imgH,
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className={`rounded-2xl ${isRunning ? 'shimmer' : 'bg-[#212121]'}`} style={{ aspectRatio: aspectRatio.replace(':', '/') }} />
              )}
              {data.results.length > 1 && (
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const prev = selectedIdx - 1;
                        if (prev >= 0) useFlowStore.getState().updateNodeData(id, { selectedResultIndex: prev });
                      }}
                    >
                      <ChevronLeft size={14} className="text-white" />
                    </button>
                    <span className="text-xs text-white font-medium px-1">
                      {selectedIdx + 1}/{data.results.length}
                    </span>
                    <button
                      className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = selectedIdx + 1;
                        if (next < data.results.length) useFlowStore.getState().updateNodeData(id, { selectedResultIndex: next });
                      }}
                    >
                      <ChevronRight size={14} className="text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : resultUrl ? (
            <div className="relative bg-[#212121] rounded-2xl overflow-hidden">
              <img src={resultUrl} alt="AI Resize result" className="w-full" />
              {data.results.length > 1 && (
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const prev = (selectedIdx) - 1;
                        if (prev >= 0) useFlowStore.getState().updateNodeData(id, { selectedResultIndex: prev });
                      }}
                    >
                      <ChevronLeft size={14} className="text-white" />
                    </button>
                    <span className="text-xs text-white font-medium px-1">
                      {(selectedIdx) + 1}/{data.results.length}
                    </span>
                    <button
                      className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = (selectedIdx) + 1;
                        if (next < data.results.length) useFlowStore.getState().updateNodeData(id, { selectedResultIndex: next });
                      }}
                    >
                      <ChevronRight size={14} className="text-white" />
                    </button>
                  </div>
                  <button
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-red-900/80 flex items-center justify-center nodrag transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = selectedIdx;
                      const newResults = data.results.filter((_, i) => i !== idx);
                      const newIdx = Math.min(idx, newResults.length - 1);
                      useFlowStore.getState().updateNodeData(id, {
                        results: newResults,
                        selectedResultIndex: Math.max(0, newIdx),
                        ...(newResults.length === 0 ? { status: 'idle' as const } : {}),
                      });
                    }}
                  >
                    <Trash2 size={12} className="text-white" />
                  </button>
                </div>
              )}
            </div>
          ) : isRunning ? (
            <div
              className="shimmer rounded-2xl"
              style={{ width: '100%', aspectRatio: aspectRatio.replace(':', '/') }}
            />
          ) : inputImageUrl ? (
            <>
              {previewLayout ? (
                <div
                  className="relative checkerboard rounded-2xl overflow-hidden mx-auto"
                  style={{ width: previewLayout.containerW, height: previewLayout.containerH }}
                >
                  <img
                    src={inputImageUrl}
                    alt="Preview"
                    className="absolute object-cover"
                    style={{
                      left: previewLayout.imgLeft,
                      top: previewLayout.imgTop,
                      width: previewLayout.imgW,
                      height: previewLayout.imgH,
                    }}
                  />
                </div>
              ) : (
                <div className="bg-[#212121] rounded-2xl aspect-square" />
              )}
            </>
          ) : (
            <div className="bg-[#212121] rounded-2xl p-8 text-center aspect-square flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect an image</span>
            </div>
          )}

          {/* Aspect Ratio selector */}
          <div className="mt-3">
            <div className="text-[11px] text-zinc-500 mb-1">Aspect Ratio</div>
            <select
              className="w-full bg-[#212121] text-zinc-300 text-xs rounded-lg px-3 py-2 border border-[#333] focus:outline-none nodrag"
              value={aspectRatio}
              onChange={(e) => {
                const val = e.target.value as AspectRatio;
                setAspectRatio(val);
                useFlowStore.getState().updateNodeSetting(id, 'aspectRatio', val);

                // Add a preview placeholder so the user sees the checkerboard as a new slot
                if (hasInput) {
                  const store = useFlowStore.getState();
                  const currentData = (store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
                  const results = currentData?.results || [];
                  // Remove any existing preview placeholder
                  const cleaned = results.filter(r => Object.values(r)[0]?.format !== 'preview');
                  const preview = { image: { content: '', format: 'preview', aspectRatio: val } };
                  store.updateNodeData(id, {
                    results: [...cleaned, preview],
                    selectedResultIndex: cleaned.length,
                    status: cleaned.length > 0 ? 'done' : 'idle',
                  });
                }
              }}
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {data.status === 'error' && data.errorMessage && (
            <div className="mt-2 text-[10px] text-red-400 truncate self-stretch" title={data.errorMessage}>
              {data.errorMessage}
            </div>
          )}

          {/* Run button */}
          <div className="mt-3 flex justify-end self-stretch">
            <button
              className={`flex items-center gap-2 h-10 px-3 rounded-2xl text-base font-medium transition-colors nodrag ${
                isRunning
                  ? 'bg-yellow-900/50 text-yellow-400 cursor-wait border border-yellow-700/50'
                  : hasInput && imgNatural
                    ? 'bg-transparent hover:bg-[#212121] text-white border border-[#292929]'
                    : 'bg-transparent text-zinc-600 border border-[#212121] cursor-not-allowed'
              }`}
              disabled={!hasInput || !imgNatural || isRunning}
              onClick={(e) => { e.stopPropagation(); handleRun(); }}
            >
              {isRunning ? <><Loader size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
