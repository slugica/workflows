'use client';

import { useRef, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';

const TYPE_ICONS: Record<string, string> = {
  import: '📁',
  prompt: '✏️',
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  textUtility: '🤖',
};

const TYPE_COLORS: Record<string, string> = {
  import: 'border-violet-500/50',
  prompt: 'border-blue-500/50',
  image: 'border-emerald-500/50',
  video: 'border-red-500/50',
  audio: 'border-amber-500/50',
  textUtility: 'border-cyan-500/50',
};

export function BaseNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const nodeType: string = String(props.type || 'import');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const store = useFlowStore.getState();
    store.updateNodeSetting(id, 'fileName', file.name);
    store.updateNodeSetting(id, 'fileUrl', url);
    store.updateNodeSetting(id, 'fileType', file.type);
  }, [id]);

  const statusColor =
    data.status === 'running'
      ? 'ring-2 ring-yellow-400 animate-pulse'
      : data.status === 'done'
        ? 'ring-2 ring-green-400'
        : data.status === 'error'
          ? 'ring-2 ring-red-400'
          : '';

  return (
    <div
      className={`
        bg-zinc-900 rounded-xl border-2 ${TYPE_COLORS[nodeType] || 'border-zinc-700'}
        ${selected ? 'ring-2 ring-white/30' : ''}
        ${statusColor}
        min-w-[220px] max-w-[280px] shadow-xl
      `}
      onClick={() => selectNode(id)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <span className="text-sm">{TYPE_ICONS[nodeType] || '📦'}</span>
        <h3 className="text-xs font-semibold text-zinc-200 truncate flex-1">
          {data.name}
        </h3>
        {data.behavior === 'dynamic' ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
            AI
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {/* Inputs */}
        {data.handles.inputs.map((handle, i) => (
          <div key={handle.id || i} className="relative flex items-center gap-2 py-1">
            <Handle
              type="target"
              position={Position.Left}
              id={handle.id}
              className="!w-3 !h-3 !rounded-full !border-2 !-left-[7px]"
              style={{
                backgroundColor: HANDLE_COLORS[handle.type],
                borderColor: HANDLE_COLORS[handle.type],
              }}
            />
            <span className="text-[11px] text-zinc-400">{handle.label}</span>
            <span
              className="text-[9px] px-1 rounded"
              style={{ color: HANDLE_COLORS[handle.type], opacity: 0.7 }}
            >
              {handle.type}
            </span>
          </div>
        ))}

        {/* Node-specific content */}
        {nodeType === 'prompt' ? (
          <div className="mt-1 mb-1">
            <textarea
              className="w-full bg-zinc-800 text-zinc-200 text-xs rounded-lg p-2 resize-none border border-zinc-700 focus:border-blue-500 focus:outline-none nodrag nowheel"
              rows={3}
              placeholder="Enter your prompt..."
              defaultValue={(data.settings.promptText as string) || ''}
              onChange={(e) => {
                useFlowStore.getState().updateNodeSetting(id, 'promptText', e.target.value);
              }}
            />
          </div>
        ) : null}

        {nodeType === 'import' ? (
          <div className="mt-1 mb-1">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={(data.settings.allowedFileTypes as string[] | undefined)?.join(',') || '*'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {data.settings.fileUrl ? (
              <div className="relative group">
                {(data.settings.fileType as string)?.startsWith('video/') ? (
                  <video
                    src={data.settings.fileUrl as string}
                    className="w-full rounded-lg max-h-[120px] object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={data.settings.fileUrl as string}
                    alt={data.settings.fileName as string}
                    className="w-full rounded-lg max-h-[120px] object-cover"
                  />
                )}
                <div className="text-[10px] text-zinc-400 mt-1 truncate">{data.settings.fileName as string}</div>
                <button
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-900/80 text-zinc-400 hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-zinc-700 rounded-lg p-3 text-center cursor-pointer hover:border-zinc-500 transition-colors nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              >
                <span className="text-zinc-500 text-xs">Drop file or click</span>
              </div>
            )}
          </div>
        ) : null}

        {nodeType === 'image' && data.settings.modelId ? (
          <div className="mt-1 mb-1 flex items-center gap-1">
            <span className="text-[10px] text-zinc-500">Model:</span>
            <span className="text-[10px] text-zinc-300">
              {String(data.settings.modelId)}
            </span>
          </div>
        ) : null}

        {/* Status */}
        {data.status === 'running' ? (
          <div className="mt-1 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px] text-yellow-400">Processing...</span>
          </div>
        ) : null}
        {data.status === 'error' && data.errorMessage ? (
          <div className="mt-1 text-[10px] text-red-400 truncate" title={data.errorMessage}>{data.errorMessage}</div>
        ) : null}

        {/* Result preview */}
        {data.results && data.results.length > 0 ? (
          <div className="mt-1 mb-1">
            {(() => {
              const result = data.results[data.selectedResultIndex || 0];
              if (!result) return null;
              const entry = Object.values(result)[0];
              if (!entry?.content) return null;
              if (entry.format === 'video') {
                return (
                  <video
                    src={entry.content}
                    className="w-full rounded-lg max-h-[140px] object-cover"
                    controls
                    muted
                  />
                );
              }
              return (
                <img
                  src={entry.content}
                  alt="Result"
                  className="w-full rounded-lg max-h-[140px] object-cover"
                />
              );
            })()}
            {data.results.length > 1 ? (
              <div className="flex items-center justify-center gap-1 mt-1">
                {data.results.map((_, i) => (
                  <button
                    key={i}
                    className={`w-2 h-2 rounded-full nodrag ${i === (data.selectedResultIndex || 0) ? 'bg-white' : 'bg-zinc-600'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      useFlowStore.getState().updateNodeData(id, { selectedResultIndex: i });
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Outputs */}
        {data.handles.outputs.map((handle, i) => (
          <div
            key={handle.id || i}
            className="relative flex items-center justify-end gap-2 py-1"
          >
            <span
              className="text-[9px] px-1 rounded"
              style={{ color: HANDLE_COLORS[handle.type], opacity: 0.7 }}
            >
              {handle.type}
            </span>
            <span className="text-[11px] text-zinc-400">{handle.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={handle.id}
              className="!w-3 !h-3 !rounded-full !border-2 !-right-[7px]"
              style={{
                backgroundColor: HANDLE_COLORS[handle.type],
                borderColor: HANDLE_COLORS[handle.type],
              }}
            />
          </div>
        ))}
      </div>

      {/* Footer with run button for dynamic nodes */}
      {data.behavior === 'dynamic' ? (
        <div className="px-3 py-2 border-t border-zinc-800">
          <button
            className={`w-full text-xs py-1.5 rounded-lg transition-colors nodrag ${
              data.status === 'running'
                ? 'bg-yellow-900/50 text-yellow-400 cursor-wait'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
            disabled={data.status === 'running'}
            onClick={(e) => {
              e.stopPropagation();
              useFlowStore.getState().runNode(id);
            }}
          >
            {data.status === 'running' ? '⏳ Running...' : '▶ Run'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
