'use client';

import { useMemo, useState, useCallback } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps, type Node, type Edge } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { ensureRemoteUrl, executeRendi } from '@/lib/executeNode';
import { useFlowStore } from '@/store/flowStore';
import { Film, Play, Loader } from 'lucide-react';
import { MediaPreview, type MediaItem } from '@/components/nodes/MediaPreview';
import { NodeQuickActions } from './NodeQuickActions';
import { theme } from '@/lib/theme';

/**
 * Resolve a single input URL by handle type substring (e.g. 'input:video' or 'input:audio').
 */
function resolveHandleUrl(
  nodeId: string,
  handleTypeStr: string,
  allNodes: Node[],
  edges: Edge[],
): string | null {
  const edge = edges.find(
    (e) => e.target === nodeId && e.targetHandle?.includes(handleTypeStr)
  );
  if (!edge) return null;

  const sourceNode = allNodes.find((n) => n.id === edge.source);
  if (!sourceNode) return null;
  const sourceData = sourceNode.data as unknown as FlowNodeData;

  if (sourceData.settings.fileUrl) {
    return sourceData.settings.fileUrl as string;
  }

  if (sourceData.results?.length) {
    const result = sourceData.results[sourceData.selectedResultIndex || 0];
    if (result) {
      const sourceHandleKey = edge.sourceHandle?.split(':').pop();
      if (sourceHandleKey && result[sourceHandleKey]?.content) {
        return result[sourceHandleKey].content;
      }
      const entry = Object.values(result)[0];
      if (entry?.content) return entry.content;
    }
  }

  return null;
}

export function CombineAudioVideoNode(props: NodeProps) {
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

  const videoUrl = useMemo(
    () => resolveHandleUrl(id, 'input:video', allNodes, edges),
    [id, allNodes, edges]
  );
  const audioUrl = useMemo(
    () => resolveHandleUrl(id, 'input:audio', allNodes, edges),
    [id, allNodes, edges]
  );

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

  const handleRun = useCallback(async () => {
    if (!videoUrl || !audioUrl) return;

    // Add placeholder
    const currentData = useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
    const existingResults = currentData?.results || [];
    const placeholderIdx = existingResults.length;
    const withPlaceholder = [...existingResults, { file: { content: '', format: 'video', loading: true } }];

    useFlowStore.getState().updateNodeData(id, {
      status: 'running',
      results: withPlaceholder,
      selectedResultIndex: placeholderIdx,
    });

    try {
      const remoteVideo = await ensureRemoteUrl(videoUrl);
      const remoteAudio = await ensureRemoteUrl(audioUrl);

      // FFmpeg: replace audio track in video with the provided audio
      // -shortest ensures output ends when the shorter stream ends
      const result = await executeRendi({
        input_files: { in_video: remoteVideo, in_audio: remoteAudio },
        output_files: { out_video: 'combined.mp4' },
        ffmpeg_command: '-i {{in_video}} -i {{in_audio}} -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest {{out_video}}',
      });

      if (!result.success) throw new Error(result.error || 'FFmpeg processing failed');

      // Replace placeholder with actual result
      const latestData = useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
      const latestResults = [...(latestData?.results || [])];
      latestResults[placeholderIdx] = { file: { content: result.url!, format: 'video' } };

      useFlowStore.getState().updateNodeData(id, {
        status: 'done',
        results: latestResults,
        selectedResultIndex: placeholderIdx,
      });
    } catch (err) {
      // Remove placeholder on error
      const latestData = useFlowStore.getState().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
      const latestResults = [...(latestData?.results || [])];
      latestResults.splice(placeholderIdx, 1);
      const newIdx = Math.min(latestData?.selectedResultIndex || 0, Math.max(0, latestResults.length - 1));

      useFlowStore.getState().updateNodeData(id, {
        status: latestResults.length > 0 ? 'done' : 'idle',
        results: latestResults,
        selectedResultIndex: newIdx,
      });
      useFlowStore.getState().addToast(`Combine Audio & Video: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [id, videoUrl, audioUrl]);

  const canRun = !!videoUrl && !!audioUrl && !isRunning;

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
          <span className="text-white"><Film size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Combine Audio & Video
          </h3>
        </header>

        {/* Input handles */}
        {data.handles.inputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -left-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.inputs.map((handle, i) => {
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
              const color = HANDLE_COLORS[handle.type];
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
                    {handle.label}
                  </span>
                </Handle>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="self-stretch">
          {previewItems.length > 0 ? (
            <MediaPreview
              items={previewItems}
              selectedIndex={data.selectedResultIndex || 0}
              onNavigate={handlePreviewNavigate}
              onDelete={handlePreviewDelete}
              emptyAspectRatio="16/9"
            />
          ) : (
            <div className="aspect-video rounded-2xl checkerboard flex items-center justify-center" style={{ backgroundColor: theme.previewBg }}>
              <span className="text-zinc-500 text-sm">
                {!videoUrl && !audioUrl
                  ? 'Connect video and audio'
                  : !videoUrl
                    ? 'Connect a video input'
                    : 'Connect an audio input'}
              </span>
            </div>
          )}

          {/* Run button */}
          <div className="mt-3 flex justify-end self-stretch">
            <button
              className={`flex items-center gap-2 h-10 px-3 rounded-2xl text-base font-medium transition-colors nodrag ${
                isRunning
                  ? 'bg-yellow-900/50 text-yellow-400 cursor-wait border border-yellow-700/50'
                  : canRun
                    ? 'bg-transparent text-white'
                    : 'bg-transparent text-zinc-600 cursor-not-allowed'
              }`}
              style={isRunning ? undefined : { border: `1px solid ${canRun ? theme.border2 : theme.border1}` }}
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
