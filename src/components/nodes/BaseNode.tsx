'use client';

import { useRef, useCallback, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodes, NodeResizer, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';
import { Upload, Type, ImageIcon, Video, AudioLines, Play, Loader } from 'lucide-react';
import { ResultNavOverlay } from '@/components/nodes/ResultNavOverlay';
import { QuickActionsBar } from '@/components/nodes/QuickActionsBar';

const TYPE_ICONS: Record<string, ReactNode> = {
  import: <Upload size={18} />,
  prompt: <Type size={18} />,
  image: <ImageIcon size={18} />,
  video: <Video size={18} />,
  audio: <AudioLines size={18} />,
};

const TYPE_LABELS: Record<string, string> = {
  import: 'Upload',
  prompt: 'Prompt',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  crop: 'Crop',
  blur: 'Blur',
  resize: 'Resize',
  filters: 'Filters',
  levels: 'Levels',
  aiResize: 'AI Resize',
  preview: 'Preview',
  export: 'Export',
  splitImage: 'Split',
  imageIterator: 'Iterator',
  videoIterator: 'Iterator',
  relight: 'Relight',
  cameraAngles: 'Camera',
  extractFrame: 'Extract',
  trimVideo: 'Trim',
  combineAudioVideo: 'Combine',
  combineVideo: 'Combine',
};

export function BaseNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const nodeType: string = String(props.type || 'import');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const edges = useEdges();
  const allNodes = useNodes();
  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const missingRequiredInputs = useMemo(() => {
    return data.handles.inputs
      .filter((h) => h.required && !connectedHandles.has(h.id))
      .map((h) => h.label);
  }, [data.handles.inputs, connectedHandles]);

  // Compute content area size like Imagine: max 480x427, min 320x320
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const contentSize = useMemo(() => {
    if (!imgNatural) return null;
    const MAX_W = 480, MAX_H = 427;
    const { w, h } = imgNatural;
    const ratio = w / h;
    let cw = MAX_W;
    let ch = cw / ratio;
    if (ch > MAX_H) {
      ch = MAX_H;
      cw = ch * ratio;
    }
    return { w: Math.round(cw), h: Math.round(ch) };
  }, [imgNatural]);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    const MAX_SIZE = 30 * 1024 * 1024; // 30MB
    if (file.size > MAX_SIZE) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 30MB.`);
      return;
    }
    setUploadError(null);
    const store = useFlowStore.getState();
    const localUrl = URL.createObjectURL(file);
    store.updateNodeSetting(id, 'fileName', file.name);
    store.updateNodeSetting(id, 'fileUrl', localUrl);
    store.updateNodeSetting(id, 'fileType', file.type);
    store.updateNodeSetting(id, 'uploading', true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/fal/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.url) {
        store.updateNodeSetting(id, 'remoteUrl', json.url);
        URL.revokeObjectURL(localUrl);
        store.updateNodeSetting(id, 'fileUrl', json.url);
      } else {
        console.error('Upload failed:', json.error);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      store.updateNodeSetting(id, 'uploading', false);
    }
  }, [id]);

  const isPrompt = nodeType === 'prompt';

  // Show quick actions on any node with image/file output (not prompt)
  const showQuickActions = useMemo(() => {
    if (isPrompt) return false;
    return data.handles.outputs.some((h) => h.type === 'file' || h.type === 'image');
  }, [isPrompt, data.handles.outputs]);

  const imageUrl = useMemo(() => {
    if (nodeType === 'import' && (data.settings.fileType as string)?.startsWith('image/') && data.settings.fileUrl)
      return data.settings.fileUrl as string;
    if (data.results?.length) {
      const result = data.results[data.selectedResultIndex || 0];
      if (result) {
        const entry = Object.values(result)[0];
        if (entry?.content && entry.format !== 'video') return entry.content;
      }
    }
    return undefined;
  }, [nodeType, data.settings.fileType, data.settings.fileUrl, data.results, data.selectedResultIndex]);

  // Fullscreen modal
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`group relative flex flex-col items-center gap-1 ${isPrompt ? 'w-full h-full' : ''}`}
      style={isPrompt ? undefined : { width: contentSize ? contentSize.w + 36 : 356 }}
      onClick={() => selectNode(id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isPrompt && (
        <NodeResizer
          minWidth={280}
          minHeight={200}
          isVisible={selected}
          lineClassName="!border-transparent"
          handleClassName="!w-3 !h-3 !bg-transparent !border-none !rounded-none"
        />
      )}

      {/* Quick actions bar */}
      {showQuickActions && (
        <QuickActionsBar
          nodeId={id}
          selected={!!selected}
          hovered={isHovered}
          fileUrl={imageUrl}
          onFullscreen={imageUrl ? () => setShowFullscreen(true) : undefined}
        />
      )}

      {/* Fullscreen modal — portaled to body to escape React Flow transform */}
      {showFullscreen && imageUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setShowFullscreen(false)}
        >
          <img src={imageUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain" />
          <button
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-[#1a1a1a] border border-[#333] text-white hover:bg-[#333] transition-colors"
            onClick={() => setShowFullscreen(false)}
          >
            &times;
          </button>
        </div>,
        document.body
      )}

      {/* Top info bar - above the card */}
      <div className="absolute bottom-full left-0 mb-1 flex w-full flex-row items-center justify-between gap-2 px-1">
        <span className="text-[12px] text-zinc-500">
          {TYPE_LABELS[nodeType] || nodeType}
        </span>
        <span className="text-[12px] text-zinc-400">
          {data.name}
        </span>
      </div>

      {/* Card */}
      <div
        className={`
          bg-[#171717] rounded-[24px] border-2 border-[#212121] relative flex flex-col items-start
          p-4 pt-3 w-full ${isPrompt ? 'flex-1' : ''}
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
          ${data.status === 'running' ? 'border-yellow-400/50' : ''}
          ${data.status === 'error' ? 'border-red-400/50' : ''}
        `}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white">{TYPE_ICONS[nodeType] || <ImageIcon size={18} />}</span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            {TYPE_LABELS[nodeType] || nodeType}
          </h3>
          {data.behavior === 'dynamic' ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#212121] text-zinc-400">
              AI
            </span>
          ) : null}
        </header>

        {/* Handle containers - positioned absolutely on the card sides */}
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

        {data.handles.outputs.length > 0 && (
          <div className="pointer-events-none absolute top-[68px] -right-[10px] flex flex-col items-center justify-center gap-6">
            {data.handles.outputs.map((handle, i) => {
              const isConnected = connectedHandles.has(handle.id);
              const color = handle.type === 'file'
                ? resolveFileHandleColor('output', data, handle.id, edges, id, allNodes)
                : HANDLE_COLORS[handle.type];
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

        {/* Content area */}
        {nodeType === 'prompt' ? (
          <textarea
            className="w-full h-full min-h-[172px] bg-[#212121] rounded-xl text-white text-base leading-6 p-3 resize-none border-none focus:outline-none focus:ring-0 nodrag nowheel nopan self-stretch flex-1"
            placeholder="Enter your prompt here..."
            defaultValue={(data.settings.promptText as string) || ''}
            onChange={(e) => {
              useFlowStore.getState().updateNodeSetting(id, 'promptText', e.target.value);
            }}
          />
        ) : null}

        {nodeType === 'import' ? (
          <div className="self-stretch">
            <input
              ref={fileInputRef}
              id={`file-input-${id}`}
              type="file"
              className="absolute w-0 h-0 opacity-0 overflow-hidden"
              accept={(data.settings.allowedFileTypes as string[] | undefined)?.join(',') || '*'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {data.settings.fileUrl ? (
              <>
                {/* Hidden image to get natural dimensions during upload */}
                {data.settings.uploading && (data.settings.fileType as string)?.startsWith('image/') && (
                  <img
                    src={data.settings.fileUrl as string}
                    alt=""
                    className="hidden"
                    onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  />
                )}
                <div
                  className="relative bg-[#212121] rounded-2xl overflow-hidden"
                  style={contentSize ? { width: contentSize.w, height: contentSize.h } : undefined}
                >
                {data.settings.uploading ? (
                  <div className="shimmer w-full h-full" style={!contentSize ? { aspectRatio: '1' } : undefined} />
                ) : (data.settings.fileType as string)?.startsWith('video/') ? (
                  <video
                    src={data.settings.fileUrl as string}
                    className="w-full h-full object-cover nodrag"
                    controls
                    muted
                    preload="metadata"
                  />
                ) : (data.settings.fileType as string)?.startsWith('audio/') ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-6" style={{ aspectRatio: '1' }}>
                    <AudioLines size={32} className="text-zinc-500" />
                    <span className="text-zinc-400 text-xs truncate max-w-full">{data.settings.fileName as string}</span>
                    <audio
                      src={data.settings.fileUrl as string}
                      className="w-full nodrag"
                      controls
                    />
                  </div>
                ) : (
                  <img
                    src={data.settings.fileUrl as string}
                    alt={data.settings.fileName as string}
                    className="w-full h-full object-cover"
                    onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  />
                )}
              </div>
              </>
            ) : (
              <label
                htmlFor={`file-input-${id}`}
                className="bg-[#212121] rounded-2xl p-8 text-center cursor-pointer hover:bg-[#292929] transition-colors nodrag block aspect-square flex flex-col items-center justify-center gap-2"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              >
                <Upload size={20} className="text-zinc-500" />
                <span className="text-zinc-400 text-sm">Drag & drop or Click to upload</span>
                <span className="text-zinc-600 text-[11px]">JPG, PNG, WEBP, MP4, MP3, WAV, up to 30MB</span>
                {uploadError && <span className="text-red-400 text-[11px] mt-1">{uploadError}</span>}
              </label>
            )}
          </div>
        ) : null}

        {/* Status */}
        {data.status === 'error' && data.errorMessage ? (
          <div className="mt-2 text-[10px] text-red-400 truncate self-stretch" title={data.errorMessage}>{data.errorMessage}</div>
        ) : null}

        {/* Result placeholder or shimmer loading */}
        {data.behavior === 'dynamic' && (!data.results || data.results.length === 0) ? (
          data.status === 'running' ? (
            <div className="self-stretch bg-[#212121] rounded-2xl overflow-hidden h-[320px] shimmer" />
          ) : (
            <div className="self-stretch bg-[#212121] rounded-2xl overflow-hidden h-[320px] checkerboard" />
          )
        ) : null}
        {data.results && data.results.length > 0 ? (
          <div className="self-stretch">
            <div className="relative bg-[#212121] rounded-2xl overflow-hidden group/preview">
              {(() => {
                const result = data.results[data.selectedResultIndex || 0];
                if (!result) return null;
                const entry = Object.values(result)[0];
                if (!entry?.content) return null;
                if (entry.format === 'video') {
                  return (
                    <video
                      key={entry.content}
                      src={entry.content}
                      className="w-full"
                      controls
                      muted
                    />
                  );
                }
                return (
                  <img
                    src={entry.content}
                    alt="Result"
                    className="w-full"
                  />
                );
              })()}
              <ResultNavOverlay nodeId={id} results={data.results} selectedResultIndex={data.selectedResultIndex || 0} />
            </div>
          </div>
        ) : null}

        {/* Footer with run button */}
        {data.behavior === 'dynamic' ? (
          <div className="mt-3 flex items-start justify-end gap-2 self-stretch">
            <button
              className={`h-10 px-3 text-base font-medium rounded-2xl nodrag flex items-center justify-center gap-2 transition-colors duration-300 ${
                data.status === 'running'
                  ? 'bg-yellow-900/50 text-yellow-400 cursor-wait border border-yellow-700/50'
                  : missingRequiredInputs.length > 0
                    ? 'bg-transparent text-zinc-600 border border-[#212121] cursor-not-allowed'
                    : 'bg-transparent hover:bg-[#212121] text-white border border-[#292929]'
              }`}
              disabled={data.status === 'running' || missingRequiredInputs.length > 0}
              onClick={(e) => {
                e.stopPropagation();
                useFlowStore.getState().runNode(id);
              }}
            >
              {data.status === 'running' ? <><Loader size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run</>}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
