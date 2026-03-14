'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { NodeResizer, type NodeProps, useViewport } from '@xyflow/react';
import { useFlowStore } from '@/store/flowStore';
import {
  Play,
  Loader,
  LayoutGrid,
  Download,
  Copy,
  Ungroup,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const SECTION_COLORS = [
  '#555555', // gray (default)
  '#3b82f6', // blue
  '#22c55e', // green
  '#ef4444', // red
  '#a855f7', // purple
  '#84cc16', // lime
  '#ec4899', // pink
  '#f97316', // orange
  '#06b6d4', // cyan
];

export const SectionNode = memo(function SectionNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as Record<string, unknown>;
  const label = (data.label as string) || 'Section';
  const color = (data.sectionColor as string) || SECTION_COLORS[0];
  const { zoom } = useViewport();

  const [running, setRunning] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  // Close color picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as HTMLElement)) {
        setColorOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRunSection = useCallback(async () => {
    setRunning(true);
    try {
      const store = useFlowStore.getState();
      const children = store.nodes.filter((n) => n.parentId === id);
      for (const child of children) {
        const childData = child.data as Record<string, unknown>;
        if (childData.behavior === 'dynamic') {
          await store.runNode(child.id);
        }
      }
    } finally {
      setRunning(false);
    }
  }, [id]);

  const handleTidyUp = useCallback(() => {
    const store = useFlowStore.getState();
    const childIds = store.nodes.filter((n) => n.parentId === id).map((n) => n.id);
    if (childIds.length > 0) store.tidyUpNodes(childIds);
  }, [id]);

  const handleDownload = useCallback(() => {
    const store = useFlowStore.getState();
    const children = store.nodes.filter((n) => n.parentId === id);
    for (const child of children) {
      const d = child.data as Record<string, unknown>;
      const settings = d.settings as Record<string, unknown> | undefined;
      const url = settings?.resultUrl as string | undefined;
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.click();
      }
    }
  }, [id]);

  const handleDuplicate = useCallback(() => {
    useFlowStore.getState().duplicateSection(id);
  }, [id]);

  const handleUngroup = useCallback(() => {
    useFlowStore.getState().ungroupSection(id);
  }, [id]);

  const handleColorChange = useCallback((c: string) => {
    useFlowStore.getState().updateNodeData(id, { sectionColor: c } as never);
    setColorOpen(false);
  }, [id]);

  const btnClass = 'w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-[#333] transition-colors nodrag';

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-[#333]"
        handleClassName="!w-2.5 !h-2.5 !bg-[#444] !border-[#666] !rounded-sm"
      />
      <div
        className="w-full h-full border"
        style={{ borderColor: color + '55', backgroundColor: color + '10' }}
      >
        {/* Section label */}
        <div
          className="absolute left-0 flex items-center gap-2"
          style={{ top: 0, transform: `translateY(calc(-100% - 8px)) scale(${1 / zoom})`, transformOrigin: 'bottom left' }}
        >
          <input
            className="text-[12px] text-zinc-400 bg-[#171717] border border-[#2a2a2a] rounded-md px-2 py-0.5 outline-none max-w-[160px] nodrag"
            defaultValue={label}
            onChange={(e) => {
              useFlowStore.getState().updateNodeData(id, { label: e.target.value } as never);
            }}
          />
        </div>

        {/* Toolbar — centered above section */}
        <div
          className={`absolute left-1/2 bottom-full mb-8 flex items-center gap-1 bg-[#1a1a1a] border border-[#333] rounded-full px-2 py-1.5 nodrag transition-opacity duration-200 ${
            selected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: 'bottom center' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color picker */}
          <div className="relative" ref={colorRef}>
            <button
              className={btnClass}
              title="Section Color"
              onClick={() => setColorOpen(!colorOpen)}
            >
              <span
                className="w-5 h-5 rounded-full border border-[#555]"
                style={{ backgroundColor: color }}
              />
              {colorOpen ? <ChevronUp size={10} className="ml-0.5" /> : <ChevronDown size={10} className="ml-0.5" />}
            </button>
            {colorOpen && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-[#333] rounded-xl py-2 px-2 shadow-xl flex items-center gap-1.5">
                {SECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      c === color ? 'border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleColorChange(c)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tidy Up */}
          <button className={btnClass} title="Tidy Up" onClick={handleTidyUp}>
            <LayoutGrid size={16} />
          </button>

          {/* Download */}
          <button className={btnClass} title="Download" onClick={handleDownload}>
            <Download size={16} />
          </button>

          {/* Duplicate */}
          <button className={btnClass} title="Duplicate Section" onClick={handleDuplicate}>
            <Copy size={16} />
          </button>

          {/* Ungroup */}
          <button className={btnClass} title="Ungroup" onClick={handleUngroup}>
            <Ungroup size={16} />
          </button>

          {/* Run Section */}
          <div className="w-px h-5 bg-[#333] mx-0.5" />
          <button
            className={`flex items-center gap-1.5 px-3 h-8 rounded-full transition-colors text-[13px] nodrag ${
              running
                ? 'text-yellow-400 bg-yellow-900/30'
                : 'text-zinc-300 hover:text-white hover:bg-[#333]'
            }`}
            title="Run Section"
            onClick={handleRunSection}
            disabled={running}
          >
            {running ? (
              <><Loader size={14} className="animate-spin" /> Running...</>
            ) : (
              <><Play size={14} /> Run Section</>
            )}
          </button>
        </div>
      </div>
    </>
  );
});
