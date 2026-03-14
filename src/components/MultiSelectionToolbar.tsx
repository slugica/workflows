'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNodes, useReactFlow, useViewport } from '@xyflow/react';
import { useFlowStore } from '@/store/flowStore';
import {
  LayoutGrid,
  Download,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  GroupIcon,
  Play,
  AlignStartHorizontal,
  ChevronDown,
} from 'lucide-react';
import type { FlowNodeData } from '@/lib/types';
import { theme } from '@/lib/theme';

const ALIGN_OPTIONS = [
  { key: 'left', icon: <AlignHorizontalJustifyStart size={16} />, label: 'Align Left' },
  { key: 'centerH', icon: <AlignHorizontalJustifyCenter size={16} />, label: 'Align Center H' },
  { key: 'right', icon: <AlignHorizontalJustifyEnd size={16} />, label: 'Align Right' },
  { key: 'top', icon: <AlignVerticalJustifyStart size={16} />, label: 'Align Top' },
  { key: 'centerV', icon: <AlignVerticalJustifyCenter size={16} />, label: 'Align Center V' },
  { key: 'bottom', icon: <AlignVerticalJustifyEnd size={16} />, label: 'Align Bottom' },
  { key: 'distributeH', icon: <AlignHorizontalSpaceBetween size={16} />, label: 'Distribute H' },
  { key: 'distributeV', icon: <AlignVerticalSpaceBetween size={16} />, label: 'Distribute V' },
] as const;

export function MultiSelectionToolbar() {
  const rfNodes = useNodes();
  const { zoom } = useViewport();
  const { flowToScreenPosition } = useReactFlow();
  const alignNodes = useFlowStore((s) => s.alignNodes);
  const tidyUpNodes = useFlowStore((s) => s.tidyUpNodes);
  const wrapInSection = useFlowStore((s) => s.wrapInSection);
  const runNode = useFlowStore((s) => s.runNode);

  const [alignOpen, setAlignOpen] = useState(false);
  const alignRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [mouseDown, setMouseDown] = useState(false);

  // Track mousedown/mouseup to suppress toolbar during drag-select
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // Ignore clicks on the toolbar itself
      if (toolbarRef.current?.contains(e.target as HTMLElement)) return;
      if (e.button === 0) setMouseDown(true);
    };
    const onUp = () => setMouseDown(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Close align dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (alignRef.current && !alignRef.current.contains(e.target as HTMLElement)) {
        setAlignOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedNodes = useMemo(
    () => rfNodes.filter((n) => n.selected && n.type !== 'section'),
    [rfNodes],
  );

  const selectedIds = useMemo(() => selectedNodes.map((n) => n.id), [selectedNodes]);

  // Check if any selected node is runnable
  const hasRunnable = useMemo(
    () => selectedNodes.some((n) => (n.data as unknown as FlowNodeData).behavior !== 'static'),
    [selectedNodes],
  );

  // Bounding box in flow coords
  const bbox = useMemo(() => {
    if (selectedNodes.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selectedNodes) {
      // Resolve absolute position
      let ax = n.position.x, ay = n.position.y;
      if (n.parentId) {
        const parent = rfNodes.find((p) => p.id === n.parentId);
        if (parent) { ax += parent.position.x; ay += parent.position.y; }
      }
      const w = n.measured?.width ?? 200;
      const h = n.measured?.height ?? 200;
      minX = Math.min(minX, ax);
      minY = Math.min(minY, ay);
      maxX = Math.max(maxX, ax + w);
      maxY = Math.max(maxY, ay + h);
    }
    return { minX, minY, maxX, maxY };
  }, [selectedNodes, rfNodes]);

  const handleRunSelected = useCallback(async () => {
    const runnableNodes = selectedNodes.filter(
      (n) => (n.data as unknown as FlowNodeData).behavior !== 'static'
    );
    for (const n of runnableNodes) {
      await runNode(n.id);
    }
  }, [selectedNodes, runNode]);

  const handleDownload = useCallback(() => {
    for (const n of selectedNodes) {
      const d = n.data as unknown as FlowNodeData;
      const url = d.settings?.resultUrl as string | undefined;
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.click();
      }
    }
  }, [selectedNodes]);

  if (!bbox || selectedNodes.length < 2 || mouseDown) return null;

  // Convert flow bbox center-top to screen coords using React Flow's built-in transform
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const screenPos = flowToScreenPosition({ x: centerX, y: bbox.minY });
  const screenX = screenPos.x;
  const screenY = screenPos.y - 16; // 16px above selection

  const btnClass = 'w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-[#333] transition-colors';

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[9990] flex items-center gap-1 rounded-full px-2 py-1.5 nodrag"
      style={{
        background: theme.toolbarBg,
        border: `1px solid ${theme.toolbarBorder}`,
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -100%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tidy Up */}
      <button className={btnClass} title="Tidy Up" onClick={() => tidyUpNodes(selectedIds)}>
        <LayoutGrid size={16} />
      </button>

      {/* Download */}
      <button className={btnClass} title="Download" onClick={handleDownload}>
        <Download size={16} />
      </button>

      {/* Align with dropdown */}
      <div className="relative" ref={alignRef}>
        <button
          className={`${btnClass} ${alignOpen ? 'text-white bg-[#333]' : ''}`}
          title="Align"
          onClick={() => setAlignOpen(!alignOpen)}
        >
          <AlignStartHorizontal size={16} />
          <ChevronDown size={10} className="ml-0.5" />
        </button>
        {alignOpen && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-xl py-1 shadow-xl flex items-center gap-0.5 px-1.5" style={{ background: theme.toolbarBg, border: `1px solid ${theme.toolbarBorder}` }}>
            {ALIGN_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-[#333] transition-colors"
                title={opt.label}
                onClick={() => {
                  alignNodes(selectedIds, opt.key);
                  setAlignOpen(false);
                }}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Wrap in Section */}
      <button className={btnClass} title="Wrap in Section" onClick={() => wrapInSection(selectedIds)}>
        <GroupIcon size={16} />
      </button>

      {/* Run Selected — only if any runnable node */}
      {hasRunnable && (
        <>
          <div className="w-px h-5 mx-0.5" style={{ background: theme.border3 }} />
          <button
            className="flex items-center gap-1.5 px-3 h-8 rounded-full text-zinc-300 hover:text-white hover:bg-[#333] transition-colors text-[13px]"
            title="Run Selected"
            onClick={handleRunSelected}
          >
            <Play size={14} />
            Run Selected
          </button>
        </>
      )}
    </div>
  );
}
