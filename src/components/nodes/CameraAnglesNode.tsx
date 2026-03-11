'use client';

import { useMemo } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Camera, Play, Loader, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

/* ─── Prompt generation helpers for camera angle ─── */
function getRotationPrompt(az: number): string {
  const n = ((az % 360) + 360) % 360;
  if (n < 15)  return 'Frontal view, camera facing the subject directly from the front.';
  if (n < 45)  return 'Slight right turn, camera shifted slightly to the right showing a three-quarter front-right view.';
  if (n < 75)  return 'Right profile view, camera positioned at the right side showing the right profile.';
  if (n < 105) return 'Sharp right profile, camera at 90 degrees showing full right side of the subject.';
  if (n < 135) return 'Back-right view, camera rotated behind and to the right of the subject.';
  if (n < 165) return 'Rear three-quarter right, camera mostly behind the subject offset to the right.';
  if (n < 195) return 'Rear view, camera positioned directly behind the subject.';
  if (n < 225) return 'Rear three-quarter left, camera mostly behind the subject offset to the left.';
  if (n < 255) return 'Back-left view, camera rotated behind and to the left of the subject.';
  if (n < 285) return 'Sharp left profile, camera at 270 degrees showing full left side of the subject.';
  if (n < 315) return 'Left profile view, camera positioned at the left side showing the left profile.';
  if (n < 345) return 'Slight left turn, camera shifted slightly to the left showing a three-quarter front-left view.';
  return 'Frontal view, camera facing the subject directly from the front.';
}

function getVerticalPrompt(el: number): string {
  if (el >= 70)  return 'Overhead bird\'s-eye view, camera directly above looking straight down.';
  if (el >= 45)  return 'High-angle shot, camera positioned well above eye level looking down at the subject.';
  if (el >= 20)  return 'Slightly elevated camera angle, above eye level with a gentle downward tilt.';
  if (el >= -10) return 'Eye-level camera angle, standard straight-on perspective.';
  if (el >= -25) return 'Slightly low angle, camera below eye level tilting upward.';
  return 'Low-angle worm\'s-eye view, camera positioned below looking up at the subject.';
}

function getZoomPrompt(zoom: number): string {
  if (zoom <= 2) return 'Wide shot, subject appears small in the frame with lots of environment visible.';
  if (zoom <= 4) return 'Medium-wide shot, subject with surrounding context visible.';
  if (zoom <= 6) return 'Medium shot, standard framing of the subject.';
  if (zoom <= 8) return 'Close-up shot, subject fills most of the frame.';
  return 'Extreme close-up, tight framing on the subject with fine detail visible.';
}

function buildCameraPrompt(azimuth: number, elevation: number, zoom: number, wideAngle: boolean): string {
  const parts = [
    `Camera Rotation: ${getRotationPrompt(azimuth)}`,
    `Camera Vertical Angle: ${getVerticalPrompt(elevation)}`,
    `Camera Zoom: ${getZoomPrompt(zoom)}`,
  ];
  if (wideAngle) {
    parts.push('Use a wide-angle lens with slight barrel distortion for a more dynamic perspective.');
  }
  return parts.join('\n');
}

/* ─── Component ─── */
export function CameraAnglesNode(props: NodeProps) {
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

  /* ─── Resolve negative prompt from text input ─── */
  const negativePrompt = useMemo(() => {
    const negEdge = edges.find(
      (e) => e.target === id && e.targetHandle?.includes(':text:negativePrompt')
    );
    if (!negEdge) return (data.settings.negativePrompt as string) || '';
    const sourceNode = allNodes.find((n) => n.id === negEdge.source);
    if (!sourceNode) return '';
    const sourceData = sourceNode.data as unknown as FlowNodeData;
    if (sourceData.results?.length > 0) {
      const selected = sourceData.results[sourceData.selectedResultIndex || 0];
      const first = selected ? Object.values(selected)[0] : null;
      if (first?.content) return first.content;
    }
    return (sourceData.settings?.promptText as string) || '';
  }, [id, edges, allNodes, data.settings.negativePrompt]);

  /* ─── Run handler ─── */
  const handleRun = async () => {
    if (!inputImageUrl) return;
    useFlowStore.getState().updateNodeData(id, { status: 'running', errorMessage: '' });

    const azimuth = (data.settings.rotateRightLeft as number) ?? 0;
    const elevation = (data.settings.verticalAngle as number) ?? 0;
    const zoom = (data.settings.moveForward as number) ?? 5;
    const guidanceScale = (data.settings.guidanceScale as number) ?? 4.5;
    const wideAngleLens = (data.settings.wideAngleLens as boolean) ?? false;
    const enableSafetyChecker = (data.settings.enableSafetyChecker as boolean) ?? false;
    const seed = data.settings.seed as number | undefined;

    const prompt = buildCameraPrompt(azimuth, elevation, zoom, wideAngleLens);

    try {
      const res = await fetch('/api/fal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'fal-ai/nano-banana-2/edit',
          input: {
            prompt,
            ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
            image_urls: [inputImageUrl],
            aspect_ratio: (data.settings.aspectRatio as string) || '3:4',
            resolution: (data.settings.resolution as string) || '1K',
            num_images: 1,
            output_format: 'png',
            guidance_scale: guidanceScale,
            ...(enableSafetyChecker ? { enable_safety_checker: true } : {}),
            ...(seed != null ? { seed } : {}),
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
        <span className="text-[11px] text-white/50">Change Camera Angle</span>
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
          <span className="text-white"><Camera size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Multiple Camera Angles
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
              <img src={resultUrl} alt="Camera angle result" className="w-full" />
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
