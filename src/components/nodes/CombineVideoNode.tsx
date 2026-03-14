'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { ensureRemoteUrl, executeRendi } from '@/lib/executeNode';
import { useFlowStore } from '@/store/flowStore';
import { Film, Play, Loader, ChevronDown } from 'lucide-react';
import { ResultNavOverlay } from '@/components/nodes/ResultNavOverlay';
import { NodeQuickActions } from './NodeQuickActions';

const HANDLE_SIZE = 18;
const HEADER_OFFSET = 68;
const CARD_PADDING_BOTTOM = 16;

function getHandleGap(count: number) { return count > 10 ? 6 : count > 6 ? 10 : 24; }
function handlesHeight(count: number) {
  if (count === 0) return 0;
  return count * HANDLE_SIZE + (count - 1) * getHandleGap(count);
}

const TRANSITIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'slideleft', label: 'Slide Left' },
  { value: 'slideright', label: 'Slide Right' },
] as const;

type TransitionType = typeof TRANSITIONS[number]['value'];

/**
 * Resolve all video URLs connected to this node's input handles, sorted by handle key.
 */
function resolveAllInputVideos(
  nodeId: string,
  allNodes: ReturnType<typeof useNodes>,
  edges: ReturnType<typeof useEdges>,
): { handleKey: string; url: string }[] {
  const results: { handleKey: string; url: string }[] = [];

  const incomingEdges = edges.filter(
    (e) => e.target === nodeId && e.targetHandle?.includes('input:video')
  );

  for (const edge of incomingEdges) {
    const sourceNode = allNodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const sourceData = sourceNode.data as unknown as FlowNodeData;

    let url: string | null = null;

    if (sourceData.settings.fileUrl) {
      url = sourceData.settings.fileUrl as string;
    } else if (sourceData.results && sourceData.results.length > 0) {
      const result = sourceData.results[sourceData.selectedResultIndex || 0];
      if (result) {
        const sourceHandleKey = edge.sourceHandle?.split(':').pop();
        if (sourceHandleKey && result[sourceHandleKey]?.content) {
          url = result[sourceHandleKey].content;
        } else {
          const entry = Object.values(result)[0];
          if (entry?.content) url = entry.content;
        }
      }
    }

    if (url && edge.targetHandle) {
      // Extract handle key from targetHandle: "{nodeId}|input:video:{key}"
      const key = edge.targetHandle.split(':').pop() || '';
      results.push({ handleKey: key, url });
    }
  }

  // Sort by handle key number (video_1, video_2, ...)
  results.sort((a, b) => {
    const numA = parseInt(a.handleKey.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.handleKey.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  return results;
}

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

/**
 * Probe video duration and dimensions by loading it in a hidden video element.
 */
function probeVideo(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      v.src = '';
    };
    v.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      v.src = '';
    };
  });
}

export function CombineVideoNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();

  const [transition, setTransition] = useState<TransitionType>(
    (data.settings.transition as TransitionType) || 'none'
  );

  const isRunning = data.status === 'running';

  const inputHandles = data.handles.inputs;
  const outputHandles = data.handles.outputs;
  const inputCount = inputHandles.length;

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const connectedVideos = useMemo(
    () => resolveAllInputVideos(id, allNodes, edges),
    [id, allNodes, edges]
  );

  const minCardHeight = inputCount > 1
    ? HEADER_OFFSET + handlesHeight(inputCount) + CARD_PADDING_BOTTOM
    : undefined;

  // Result
  const resultEntry = data.results && data.results.length > 0
    ? data.results[data.selectedResultIndex || 0]
    : null;
  const resultMeta = resultEntry ? Object.values(resultEntry)[0] : null;
  const resultUrl = resultMeta?.content || null;
  const isPlaceholder = resultMeta?.loading === true;

  // Video metadata for xfade offset calculation and resolution normalization
  const [videoMetas, setVideoMetas] = useState<Map<string, VideoMeta>>(new Map());

  useEffect(() => {
    for (const cv of connectedVideos) {
      if (!videoMetas.has(cv.handleKey)) {
        probeVideo(cv.url).then(meta => {
          setVideoMetas(prev => new Map(prev).set(cv.handleKey, meta));
        }).catch(() => {});
      }
    }
  }, [connectedVideos]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRun = useCallback(async () => {
    if (connectedVideos.length < 2) return;

    // Add a placeholder entry to the results queue immediately
    const currentData = (useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
    const existingResults = currentData?.results || [];
    const placeholderIdx = existingResults.length;
    const withPlaceholder = [...existingResults, { file: { content: '', format: 'video', loading: true } }];

    useFlowStore.getState().updateNodeData(id, {
      status: 'running',
      errorMessage: '',
      results: withPlaceholder,
      selectedResultIndex: placeholderIdx,
    });

    try {
      // Probe metadata (use cached or probe inline)
      const metas: VideoMeta[] = [];
      for (const cv of connectedVideos) {
        let m = videoMetas.get(cv.handleKey);
        if (!m) {
          try {
            m = await probeVideo(cv.url);
            setVideoMetas(prev => new Map(prev).set(cv.handleKey, m!));
          } catch {
            throw new Error(`Failed to load metadata for video "${cv.handleKey}"`);
          }
        }
        metas.push(m);
      }

      // Upload all blob URLs to remote storage
      const remoteUrls: string[] = [];
      for (const cv of connectedVideos) {
        remoteUrls.push(await ensureRemoteUrl(cv.url));
      }

      const n = remoteUrls.length;

      // Build input_files map
      const input_files: Record<string, string> = {};
      for (let i = 0; i < n; i++) {
        input_files[`in_${i}`] = remoteUrls[i];
      }

      // Target resolution: use the LARGEST video dimensions (ensure even for yuv420p)
      const maxW = Math.max(...metas.map(m => m.width));
      const maxH = Math.max(...metas.map(m => m.height));
      const targetW = Math.floor(maxW / 2) * 2;
      const targetH = Math.floor(maxH / 2) * 2;

      // Scale filter: fit to target, normalize framerate + timebase + pixel format
      const scaleFilter = (i: number, outLabel: string) =>
        `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=${targetW}:${targetH}:(${targetW}-iw)/2:(${targetH}-ih)/2:color=black,setsar=1,fps=30000/1001,format=yuv420p,settb=AVTB${outLabel}`;

      // Build FFmpeg command
      const inputArgs = Array.from({ length: n }, (_, i) => `-i {{in_${i}}}`).join(' ');

      const buildCommand = (withAudio: boolean): string => {
        const scaleParts = Array.from({ length: n }, (_, i) => scaleFilter(i, `[s${i}]`));

        if (transition === 'none') {
          // Simple concat with scaled inputs
          const concatStreams = Array.from({ length: n }, (_, i) =>
            withAudio ? `[s${i}][${i}:a]` : `[s${i}]`
          ).join('');
          const concatFilter = `${concatStreams}concat=n=${n}:v=1:a=${withAudio ? 1 : 0}${withAudio ? '[outv][outa]' : '[outv]'}`;
          const filterComplex = [...scaleParts, concatFilter].join(';');
          return `${inputArgs} -filter_complex "${filterComplex}" -map "[outv]"${withAudio ? ' -map "[outa]"' : ' -an'} -pix_fmt yuv420p -c:v libx264 {{out_video}}`;
        }

        // Xfade with transitions
        const TRANSITION_DURATION = 0.5;

        // Build chained xfade for video (using scaled inputs)
        const xfadeParts: string[] = [];
        let prevLabel = '[s0]';
        let cumulativeOffset = 0;

        for (let i = 1; i < n; i++) {
          const offset = cumulativeOffset + metas[i - 1].duration - TRANSITION_DURATION;
          const outLabel = i === n - 1 ? '[outv]' : `[xv${i}]`;
          xfadeParts.push(`${prevLabel}[s${i}]xfade=transition=${transition}:duration=${TRANSITION_DURATION}:offset=${offset.toFixed(3)}${outLabel}`);
          prevLabel = outLabel;
          cumulativeOffset = offset;
        }

        if (!withAudio) {
          const filterComplex = [...scaleParts, ...xfadeParts].join(';');
          return `${inputArgs} -filter_complex "${filterComplex}" -map "[outv]" -an -pix_fmt yuv420p -c:v libx264 {{out_video}}`;
        }

        // Build chained acrossfade for audio
        const audioParts: string[] = [];
        let prevAudioLabel = '[0:a]';
        for (let i = 1; i < n; i++) {
          const outLabel = i === n - 1 ? '[outa]' : `[xa${i}]`;
          audioParts.push(`${prevAudioLabel}[${i}:a]acrossfade=d=${TRANSITION_DURATION}${outLabel}`);
          prevAudioLabel = outLabel;
        }

        const filterComplex = [...scaleParts, ...xfadeParts, ...audioParts].join(';');
        return `${inputArgs} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -pix_fmt yuv420p -c:v libx264 {{out_video}}`;
      };

      // Try with audio first
      let result = await executeRendi({
        input_files,
        output_files: { out_video: 'combined.mp4' },
        ffmpeg_command: buildCommand(true),
      });

      // Fallback: retry without audio
      if (!result.success) {
        result = await executeRendi({
          input_files,
          output_files: { out_video: 'combined.mp4' },
          ffmpeg_command: buildCommand(false),
        });
      }

      if (!result.success) throw new Error(result.error || 'FFmpeg processing failed');

      // Replace placeholder with actual result
      const latestData = (useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
      const latestResults = [...(latestData?.results || [])];
      latestResults[placeholderIdx] = { file: { content: result.url!, format: 'video' } };

      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: latestResults,
        selectedResultIndex: placeholderIdx,
      });
    } catch (err) {
      // Remove placeholder on error
      const latestData = (useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
      const latestResults = [...(latestData?.results || [])];
      latestResults.splice(placeholderIdx, 1);
      const newIdx = Math.min(latestData?.selectedResultIndex || 0, Math.max(0, latestResults.length - 1));

      useFlowStore.getState().updateNodeData(id, {
        status: latestResults.length > 0 ? 'done' : 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        results: latestResults,
        selectedResultIndex: newIdx,
      });
    }
  }, [id, connectedVideos, transition, videoMetas]);

  const canRun = connectedVideos.length >= 2 && !isRunning;

  return (
    <NodeQuickActions nodeId={id} selected={selected} data={data}
      className="group relative flex flex-col items-center gap-1"
      style={{ width: 360 }}
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
          ${isRunning ? 'border-yellow-400/50' : ''}
          ${data.status === 'error' ? 'border-red-400/50' : ''}
        `}
        style={minCardHeight ? { minHeight: minCardHeight } : undefined}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Film size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Combine Video
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
              const color = handle.type === 'file'
                ? resolveFileHandleColor('input', data, handle.id, edges, id, allNodes)
                : HANDLE_COLORS[handle.type];
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
                    Input Videos {i + 1} *
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
              const color = HANDLE_COLORS[handle.type];
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
                    Output Video
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="self-stretch">
          {/* Preview area */}
          {isPlaceholder ? (
            <div className="relative bg-[#212121] rounded-2xl overflow-hidden group/preview">
              <ResultNavOverlay nodeId={id} results={data.results} selectedResultIndex={data.selectedResultIndex || 0} />
              <div className="shimmer w-full aspect-video" />
            </div>
          ) : resultUrl ? (
            <div className="relative bg-[#212121] rounded-2xl overflow-hidden group/preview">
              <ResultNavOverlay nodeId={id} results={data.results} selectedResultIndex={data.selectedResultIndex || 0} />
              <video
                key={resultUrl}
                src={resultUrl}
                className="w-full"
                controls
                playsInline
                preload="metadata"
              />
            </div>
          ) : (
            <div className="aspect-video bg-[#212121] rounded-2xl checkerboard flex items-center justify-center">
              <span className="text-zinc-500 text-sm">
                {connectedVideos.length < 2 ? 'Connect at least 2 videos' : 'Ready to combine'}
              </span>
            </div>
          )}

          {/* Transition dropdown */}
          <div className="mt-3">
            <div className="text-[11px] text-zinc-500 mb-1">Transition</div>
            <div className="relative">
              <select
                className="w-full bg-[#212121] text-zinc-300 text-xs rounded-lg px-3 py-2 border border-[#333] focus:outline-none appearance-none nodrag pr-8"
                value={transition}
                onChange={(e) => {
                  const val = e.target.value as TransitionType;
                  setTransition(val);
                  useFlowStore.getState().updateNodeSetting(id, 'transition', val);
                }}
              >
                {TRANSITIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
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
                  : canRun
                    ? 'bg-transparent hover:bg-[#212121] text-white border border-[#292929]'
                    : 'bg-transparent text-zinc-600 border border-[#212121] cursor-not-allowed'
              }`}
              disabled={!canRun}
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
