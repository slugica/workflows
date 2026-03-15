'use client';

import { useRef, useCallback, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodes, NodeResizer, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS, resolveFileHandleColor } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';
import { Upload, Type, ImageIcon, Video, AudioLines, Play, Loader, Plus } from 'lucide-react';
import { MediaPreview, type MediaItem } from '@/components/nodes/MediaPreview';
import { QuickActionsBar, type QuickActionMode } from '@/components/nodes/QuickActionsBar';
import { theme } from '@/lib/theme';
import { uploadFile } from '@/lib/uploadFile';

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
  const addMoreInputRef = useRef<HTMLInputElement>(null);
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
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 50MB.`);
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
      const { url, thumbnail } = await uploadFile(file);
      URL.revokeObjectURL(localUrl);
      const s = useFlowStore.getState();
      s.updateNodeSetting(id, 'remoteUrl', url);
      s.updateNodeSetting(id, 'fileUrl', url);
      if (thumbnail) s.updateNodeSetting(id, 'videoThumbnail', thumbnail);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      useFlowStore.getState().updateNodeSetting(id, 'uploading', false);
    }
  }, [id]);

  const handleAddMore = useCallback(async (file: File) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      console.warn('File too large:', file.size);
      return;
    }
    const format = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';

    // Add placeholder immediately
    const store0 = useFlowStore.getState();
    const curData = store0.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
    const existing = [...(curData?.results || [])];
    if (existing.length === 0 && curData?.settings?.fileUrl) {
      const curFmt = (curData.settings.fileType as string)?.startsWith('video/') ? 'video'
        : (curData.settings.fileType as string)?.startsWith('audio/') ? 'audio' : 'image';
      const firstThumb = curData.settings.videoThumbnail as string | undefined;
      existing.push({ file: { content: curData.settings.fileUrl as string, format: curFmt, ...(firstThumb ? { thumbnail: firstThumb } : {}) } });
    }
    const placeholderIdx = existing.length;
    const withPlaceholder = [...existing, { file: { content: '', format, loading: true } }];
    store0.updateNodeData(id, { results: withPlaceholder, selectedResultIndex: placeholderIdx, status: 'done' });

    try {
      const { url, thumbnail } = await uploadFile(file);
      const store = useFlowStore.getState();
      const freshData = store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
      const latest = [...(freshData?.results || [])];
      const entry = { content: url, format, ...(thumbnail ? { thumbnail } : {}) };
      if (placeholderIdx < latest.length) {
        latest[placeholderIdx] = { file: entry };
      } else {
        latest.push({ file: entry });
      }
      store.updateNodeData(id, {
        results: latest,
        selectedResultIndex: placeholderIdx,
        settings: { ...freshData.settings, fileUrl: url, fileType: file.type, fileName: file.name },
      });
    } catch (err) {
      console.error('Upload error:', err);
      const store = useFlowStore.getState();
      const freshData = store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
      const latest = [...(freshData?.results || [])];
      if (placeholderIdx < latest.length) {
        latest.splice(placeholderIdx, 1);
      }
      const newIdx = Math.max(0, Math.min(placeholderIdx - 1, latest.length - 1));
      store.updateNodeData(id, { results: latest, selectedResultIndex: newIdx });
    }
  }, [id]);

  // Build unified media items for import nodes
  const importItems = useMemo((): MediaItem[] => {
    if (nodeType !== 'import') return [];
    // If we have results array (multiple files), use that
    if (data.results && data.results.length > 0) {
      return data.results.map(r => {
        const entry = Object.values(r)[0];
        return {
          content: entry?.content || '',
          format: (entry?.format === 'video' ? 'video' : entry?.format === 'audio' ? 'audio' : 'image') as MediaItem['format'],
          loading: !!entry?.loading,
          label: data.settings.fileName as string | undefined,
          thumbnail: entry?.thumbnail as string | undefined,
        };
      });
    }
    // Single file from settings
    if (data.settings.fileUrl) {
      const ft = data.settings.fileType as string | undefined;
      const fmt: MediaItem['format'] = ft?.startsWith('video/') ? 'video' : ft?.startsWith('audio/') ? 'audio' : 'image';
      return [{
        content: data.settings.fileUrl as string,
        format: fmt,
        loading: !!data.settings.uploading,
        label: data.settings.fileName as string | undefined,
        thumbnail: data.settings.videoThumbnail as string | undefined,
      }];
    }
    return [];
  }, [nodeType, data.results, data.settings.fileUrl, data.settings.fileType, data.settings.uploading, data.settings.fileName, data.settings.videoThumbnail]);

  // Build unified media items for AI result nodes
  const aiItems = useMemo((): MediaItem[] => {
    if (nodeType === 'import' || !data.results?.length) return [];
    return data.results.map(r => {
      const entry = Object.values(r)[0];
      return {
        content: entry?.content || '',
        format: (entry?.format === 'video' ? 'video' : entry?.format === 'audio' ? 'audio' : 'image') as MediaItem['format'],
        loading: !!entry?.loading,
      };
    });
  }, [nodeType, data.results]);

  const handleImportNavigate = useCallback((idx: number) => {
    const store = useFlowStore.getState();
    const freshData = store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
    store.updateNodeData(id, { selectedResultIndex: idx });
    // Sync settings.fileUrl from results (use fresh state)
    const results = freshData?.results;
    if (results?.[idx]) {
      const entry = Object.values(results[idx])[0];
      if (entry?.content && !entry.loading) {
        const fmt = entry.format;
        const mime = fmt === 'video' ? 'video/mp4' : fmt === 'audio' ? 'audio/mpeg' : 'image/png';
        store.updateNodeData(id, { settings: { ...freshData.settings, fileUrl: entry.content, fileType: mime } });
      }
    }
  }, [id]);

  const handleImportDelete = useCallback((idx: number) => {
    const store = useFlowStore.getState();
    const freshData = store.nodes.find(n => n.id === id)?.data as unknown as FlowNodeData;
    const results = freshData?.results || [];
    if (results.length <= 1) {
      store.updateNodeData(id, {
        settings: { ...freshData.settings, fileUrl: undefined, fileType: undefined, fileName: undefined },
        results: [],
        selectedResultIndex: 0,
        status: 'idle',
      });
      setImgNatural(null);
      return;
    }
    const newResults = results.filter((_, i) => i !== idx);
    const newIdx = Math.max(0, Math.min(idx, newResults.length - 1));
    const entry = Object.values(newResults[newIdx])[0];
    const mime = entry?.format === 'video' ? 'video/mp4' : entry?.format === 'audio' ? 'audio/mpeg' : 'image/png';
    store.updateNodeData(id, {
      results: newResults,
      selectedResultIndex: newIdx,
      settings: { ...freshData.settings, fileUrl: entry?.content, fileType: mime },
    });
  }, [id]);

  const handleAiNavigate = useCallback((idx: number) => {
    useFlowStore.getState().updateNodeData(id, { selectedResultIndex: idx });
  }, [id]);

  const handleAiDelete = useCallback((idx: number) => {
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

  const isPrompt = nodeType === 'prompt';

  // Determine quick actions mode based on output type
  const quickActionMode = useMemo((): QuickActionMode | null => {
    if (isPrompt) return null;
    const outputs = data.handles.outputs;
    if (outputs.some((h) => h.type === 'video')) return 'video';
    if (outputs.some((h) => h.type === 'image')) return 'image';
    if (outputs.some((h) => h.type === 'file')) {
      // For file outputs (import nodes), detect from fileType setting
      const ft = data.settings.fileType as string | undefined;
      if (ft?.startsWith('video/')) return 'video';
      return 'image';
    }
    return null;
  }, [isPrompt, data.handles.outputs, data.settings.fileType]);

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
      {quickActionMode && (
        <QuickActionsBar
          nodeId={id}
          selected={!!selected}
          hovered={isHovered}
          mode={quickActionMode}
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
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors"
            style={{ backgroundColor: theme.surface3, border: `1px solid ${theme.border3}` }}
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
          rounded-[24px] border-2 relative flex flex-col items-start
          p-4 pt-3 w-full ${isPrompt ? 'flex-1' : ''}
          drop-shadow-sm group-hover:drop-shadow-md
          ${selected ? 'border-white/30 show-labels' : ''}
          ${data.status === 'running' ? 'border-yellow-400/50' : ''}
          ${data.status === 'error' ? 'border-red-400/50' : ''}
        `}
        style={{
          backgroundColor: theme.surface1,
          borderColor: selected ? undefined : data.status === 'running' ? undefined : data.status === 'error' ? undefined : theme.border1,
        }}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white">{TYPE_ICONS[nodeType] || <ImageIcon size={18} />}</span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            {TYPE_LABELS[nodeType] || nodeType}
          </h3>
          {data.behavior === 'dynamic' ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded text-zinc-400" style={{ backgroundColor: theme.surface2 }}>
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

        {/* Content area */}
        {nodeType === 'prompt' ? (
          <textarea
            className="w-full h-full min-h-[172px] rounded-xl text-white text-base leading-6 p-3 resize-none border-none focus:outline-none focus:ring-0 nodrag nowheel nopan self-stretch flex-1"
            style={{ backgroundColor: theme.surface2 }}
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
            {importItems.length > 0 ? (
              <>
                <MediaPreview
                  items={importItems}
                  selectedIndex={data.selectedResultIndex || 0}
                  onNavigate={handleImportNavigate}
                  onDelete={handleImportDelete}
                  onImageLoad={(w, h) => setImgNatural({ w, h })}
                />
                {/* Add More button */}
                {!data.settings.uploading && (
                  <>
                    <input
                      ref={addMoreInputRef}
                      type="file"
                      className="absolute w-0 h-0 opacity-0 overflow-hidden"
                      accept={
                        (data.settings.fileType as string)?.startsWith('video/') ? 'video/*'
                          : (data.settings.fileType as string)?.startsWith('audio/') ? 'audio/*'
                          : 'image/*'
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAddMore(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      className="flex items-center gap-1.5 mt-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors nodrag"
                      onClick={(e) => { e.stopPropagation(); addMoreInputRef.current?.click(); }}
                    >
                      <Plus size={14} />
                      Add More {(data.settings.fileType as string)?.startsWith('video/') ? 'Video' : (data.settings.fileType as string)?.startsWith('audio/') ? 'Audio' : 'Image'}
                    </button>
                  </>
                )}
              </>
            ) : (
              <label
                htmlFor={`file-input-${id}`}
                className="rounded-2xl p-8 text-center cursor-pointer transition-colors nodrag block aspect-square flex flex-col items-center justify-center gap-2"
                style={{ backgroundColor: theme.surface2 }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = theme.surfaceHover; }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = theme.surface2; }}
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

        {/* Status — errors shown via toast, no inline display */}

        {/* AI result preview */}
        {data.behavior === 'dynamic' ? (
          <div className="self-stretch">
            <MediaPreview
              items={aiItems}
              selectedIndex={data.selectedResultIndex || 0}
              onNavigate={handleAiNavigate}
              onDelete={handleAiDelete}
              emptyState={data.status === 'running' ? 'shimmer' : 'checkerboard'}
            />
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
                    ? 'bg-transparent text-zinc-600 cursor-not-allowed'
                    : 'bg-transparent text-white'
              }`}
              style={
                data.status === 'running' ? undefined
                : missingRequiredInputs.length > 0 ? { border: `1px solid ${theme.border1}` }
                : { border: `1px solid ${theme.border2}` }
              }
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
