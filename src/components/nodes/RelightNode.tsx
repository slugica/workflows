'use client';

import { useMemo } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Sun, Play, Loader, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

/* ─── Prompt generation helpers ─── */
function getAzimuthPrompt(az: number): string {
  const n = ((az % 360) + 360) % 360;
  if (n < 30)  return 'Subtle offset lighting from the front-right, soft modeling shadows on the left.';
  if (n < 60)  return 'High-contrast side lighting from the right, sculpting the cheekbones.';
  if (n < 90)  return 'Sharp profile lighting from the direct right (same as Right preset).';
  if (n < 120) return 'Back-right lighting, highlighting the right shoulder and jawline from behind.';
  if (n < 150) return 'Deep back-lighting from the right rear, creating a thin rim of light on the right edge.';
  if (n < 180) return 'Pure backlight, halo effect (same as Back preset).';
  if (n < 210) return 'Pure backlight, intense rim lighting, halo effect around the silhouette.';
  if (n < 240) return 'Deep back-lighting from the rear-left, thin rim light on the left jaw and shoulder.';
  if (n < 270) return 'Kicker light from the back-left, highlighting the left side profile from behind.';
  if (n < 300) return 'Hard side-lighting from the direct left, half the face in shadow (same as Left preset).';
  if (n < 330) return 'Broad lighting from the front-left, well-defined facial features with soft shadows on the right.';
  return 'Subtle offset lighting from the front-left, nearly frontal but with slight depth.';
}

function getElevationPrompt(el: number): string {
  if (el >= 60)  return 'Vertical overhead light, god ray effect (same as Top preset).';
  if (el >= 30)  return 'High-angle lighting, creates deep shadows in the eye sockets and under the nose.';
  if (el >= 0)   return 'Classic Rembrandt lighting, light source slightly elevated above eye level.';
  if (el >= -30) return 'Low-angle lighting, light hitting the chin and neck, casting shadows upward.';
  if (el >= -60) return 'Steep low-angle lighting, dramatic horror-style lighting from below.';
  return 'Direct vertical light from the ground (same as Bottom preset).';
}

function getIntensityPrompt(intensity: number): string {
  if (intensity <= 3) return 'With soft, diffused ambient glow.';
  if (intensity <= 7) return 'With clear directional studio lighting.';
  return 'With harsh, high-contrast intense spotlight.';
}

function buildRelightPrompt(azimuth: number, elevation: number, intensity: number, colorHex: string): string {
  return [
    `Horizontal Lighting Instruction : ${getAzimuthPrompt(azimuth)};`,
    `Vertical Lighting Instruction : ${getElevationPrompt(elevation)};`,
    `Intensity Instruction: ${getIntensityPrompt(intensity)};`,
    `Light Color instruction: Hex Code: ${colorHex};`,
  ].join('\n');
}

/* ─── Component ─── */
export function RelightNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();

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

  /* ─── Run handler ─── */
  const handleRun = async () => {
    if (!inputImageUrl) return;
    useFlowStore.getState().updateNodeData(id, { status: 'running', errorMessage: '' });

    const azimuth = (data.settings.azimuth as number) ?? 0;
    const elevation = (data.settings.elevation as number) ?? 0;
    const intensity = (data.settings.lightIntensity as number) ?? 7;
    const colorHex = (data.settings.colorHex as string) ?? '#ffffff';

    const prompt = buildRelightPrompt(azimuth, elevation, intensity, colorHex);

    try {
      const res = await fetch('/api/fal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'fal-ai/nano-banana-2/edit',
          input: {
            prompt,
            image_urls: [inputImageUrl],
            aspect_ratio: (data.settings.aspectRatio as string) || '3:4',
            resolution: (data.settings.resolution as string) || '1K',
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

      const currentData = useFlowStore.getState().nodes.find((n) => n.id === id)?.data as unknown as FlowNodeData;
      const existingResults = (currentData?.results || []).filter(
        (r) => Object.values(r)[0]?.format !== 'preview'
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

  /* ─── Result display state ─── */
  const selectedIdx = data.selectedResultIndex || 0;
  const resultEntry = data.results && data.results.length > 0 ? data.results[selectedIdx] : null;
  const resultMeta = resultEntry ? Object.values(resultEntry)[0] : null;
  const resultUrl = resultMeta?.format !== 'preview' ? resultMeta?.content : null;

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
        <span className="text-[11px] text-white/50">Relight</span>
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
          <span className="text-white"><Sun size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Relight
          </h3>
        </header>

        {/* Input handle */}
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

        {/* Output handle */}
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
          {isRunning ? (
            <div
              className="shimmer rounded-2xl"
              style={{ width: '100%', aspectRatio: ((data.settings.aspectRatio as string) || '3:4').replace(':', '/') }}
            />
          ) : resultUrl && resultMeta?.format !== 'preview' ? (
            <div className="relative bg-[#212121] rounded-2xl overflow-hidden">
              <img src={resultUrl} alt="Relight result" className="w-full" />
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
          ) : hasInput ? (
            <div className="relative">
              <div
                className="checkerboard rounded-2xl"
                style={{ width: '100%', aspectRatio: ((data.settings.aspectRatio as string) || '3:4').replace(':', '/') }}
              />
              {data.results && data.results.length > 1 && (
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
          ) : (
            <div className="bg-[#212121] rounded-2xl p-8 text-center aspect-square flex items-center justify-center">
              <span className="text-zinc-500 text-sm">Connect an image</span>
            </div>
          )}

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
                  : hasInput
                    ? 'bg-transparent hover:bg-[#212121] text-white border border-[#292929]'
                    : 'bg-transparent text-zinc-600 border border-[#212121] cursor-not-allowed'
              }`}
              disabled={!hasInput || isRunning}
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
