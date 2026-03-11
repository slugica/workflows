'use client';

import { useCallback, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { FlowNodeData, HANDLE_COLORS } from '@/lib/types';
import { resolveInputImageUrl } from '@/lib/resolveInput';
import { useFlowStore } from '@/store/flowStore';
import { Upload, Loader } from 'lucide-react';

const FILE_TYPES = [
  { label: 'PNG', value: 'png', mime: 'image/png' },
  { label: 'JPG', value: 'jpg', mime: 'image/jpeg' },
  { label: 'WEBP', value: 'webp', mime: 'image/webp' },
];

const SCALES = [1, 2, 3, 4];

export function ExportNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as FlowNodeData;
  const selectNode = useFlowStore((s) => s.selectNode);
  const allNodes = useNodes();
  const edges = useEdges();

  const [fileType, setFileType] = useState<string>((data.settings.fileType as string) || 'png');
  const [scale, setScale] = useState<number>((data.settings.scale as number) || 1);
  const [exporting, setExporting] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const connectedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [edges, id]);

  const inputImageUrl = resolveInputImageUrl(id, allNodes, edges);

  // Load natural dimensions when input changes
  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  }, []);

  const exportW = imgSize.w * scale;
  const exportH = imgSize.h * scale;

  const handleExport = useCallback(async () => {
    if (!inputImageUrl || imgSize.w === 0) return;
    setExporting(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = inputImageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = exportW;
      canvas.height = exportH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.drawImage(img, 0, 0, exportW, exportH);

      const ftConfig = FILE_TYPES.find((f) => f.value === fileType) || FILE_TYPES[0];
      const quality = fileType === 'png' ? undefined : 0.95;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          ftConfig.mime,
          quality
        );
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.name}_${exportW}x${exportH}.${fileType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [inputImageUrl, imgSize, exportW, exportH, fileType, data.name]);

  return (
    <div
      className="group relative flex flex-col items-center gap-1 w-[356px]"
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
        `}
      >
        {/* Header */}
        <header className="mb-2 flex h-7 items-center justify-between gap-2 self-stretch">
          <span className="text-white"><Upload size={18} /></span>
          <h3 className="text-base font-medium text-white line-clamp-1 flex-1 text-ellipsis overflow-hidden">
            Export
          </h3>
        </header>

        {/* Input handle */}
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

        {/* Content */}
        <div className="self-stretch">
          {inputImageUrl ? (
            <div className="rounded-2xl bg-[#212121]/50 p-4 space-y-3">
              {/* Hidden image to get natural dimensions */}
              <img
                src={inputImageUrl}
                alt=""
                className="hidden"
                crossOrigin="anonymous"
                onLoad={onImgLoad}
              />

              {/* File type */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-500">File type</label>
                <select
                  className="w-full bg-[#171717] text-zinc-300 text-xs rounded-lg px-3 py-2 border border-[#333] focus:outline-none nodrag"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                >
                  {FILE_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-zinc-500">Size</label>
                <div className="grid grid-cols-4 gap-2 mb-1">
                  {SCALES.map((s) => (
                    <button
                      key={s}
                      className={`h-7 rounded-lg text-xs font-medium border transition-colors nodrag ${
                        scale === s
                          ? 'border-white/40 text-white bg-[#212121]'
                          : 'border-[#333] text-zinc-400 hover:border-zinc-500'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setScale(s);
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                {imgSize.w > 0 && (
                  <span className="text-[10px] text-zinc-500">
                    Export size: {exportW} × {exportH}px
                  </span>
                )}
              </div>

              {/* Export button */}
              <button
                className={`w-full h-10 rounded-2xl text-sm font-medium transition-colors nodrag ${
                  exporting
                    ? 'bg-[#333] text-zinc-400 cursor-wait'
                    : 'bg-white text-black hover:bg-zinc-200'
                }`}
                disabled={exporting || imgSize.w === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport();
                }}
              >
                {exporting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader size={14} className="animate-spin" /> Exporting...
                  </span>
                ) : (
                  'Export'
                )}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#212121]/50 p-6 flex flex-col items-center justify-center gap-2">
              <Upload size={24} className="text-zinc-600" />
              <span className="text-zinc-500 text-xs text-center">No input connected</span>
              <span className="text-zinc-600 text-[10px] text-center">Connect a node to the input to export your content</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
