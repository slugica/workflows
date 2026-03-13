'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useFlowStore } from '@/store/flowStore';
import {
  ArrowUpFromDot,
  Pencil,
  Film,
  Crop,
  Eraser,
  Scaling,
  Download,
  Maximize2,
} from 'lucide-react';
import type { FlowNodeType } from '@/lib/types';

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  type: FlowNodeType;
  templateLabel: string;
}

const IMAGE_ACTIONS: QuickAction[] = [
  { icon: <ArrowUpFromDot size={16} />, label: 'Upscale', type: 'image', templateLabel: 'Topaz Upscale' },
  { icon: <Pencil size={16} />, label: 'Edit', type: 'image', templateLabel: 'FLUX Kontext Pro' },
  { icon: <Film size={16} />, label: 'Animate', type: 'video', templateLabel: 'Kling v3 Pro' },
  { icon: <Crop size={16} />, label: 'Crop', type: 'crop', templateLabel: 'Crop' },
  { icon: <Eraser size={16} />, label: 'Remove BG', type: 'image', templateLabel: 'Bria BG Remove' },
  { icon: <Scaling size={16} />, label: 'AI Resize', type: 'aiResize', templateLabel: 'AI Resize' },
];

interface QuickActionsBarProps {
  nodeId: string;
  selected: boolean;
  hovered: boolean;
  fileUrl?: string;
  onFullscreen?: () => void;
}

export function QuickActionsBar({ nodeId, selected, hovered, fileUrl, onFullscreen }: QuickActionsBarProps) {
  const addConnectedNode = useFlowStore((s) => s.addConnectedNode);
  const [delayedVisible, setDelayedVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Show after 1s hover delay, hide after 1s unhover delay
  useEffect(() => {
    if (hovered) {
      clearTimeout(timerRef.current);
      showTimerRef.current = setTimeout(() => setDelayedVisible(true), 700);
    } else {
      clearTimeout(showTimerRef.current);
      timerRef.current = setTimeout(() => setDelayedVisible(false), 1000);
    }
    return () => { clearTimeout(timerRef.current); clearTimeout(showTimerRef.current); };
  }, [hovered]);

  const visible = selected || delayedVisible;

  const handleAction = useCallback((action: QuickAction) => {
    addConnectedNode(nodeId, action.type, action.templateLabel);
  }, [nodeId, addConnectedNode]);

  const handleDownload = useCallback(() => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = '';
    a.click();
  }, [fileUrl]);

  return (
    <div
      className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-8 flex items-center gap-1 bg-[#1a1a1a] border border-[#333] rounded-full px-2 py-1.5 transition-opacity duration-200 nodrag ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        clearTimeout(timerRef.current);
        setDelayedVisible(true);
      }}
      onMouseLeave={() => {
        if (!selected) {
          timerRef.current = setTimeout(() => setDelayedVisible(false), 1000);
        }
      }}
    >
      {IMAGE_ACTIONS.map((action) => (
        <button
          key={action.templateLabel}
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-[#333] transition-colors"
          title={action.label}
          onClick={() => handleAction(action)}
        >
          {action.icon}
        </button>
      ))}
      {(fileUrl || onFullscreen) && <div className="w-px h-5 bg-[#333] mx-0.5" />}
      {fileUrl && (
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-[#333] transition-colors"
          title="Download"
          onClick={handleDownload}
        >
          <Download size={16} />
        </button>
      )}
      {onFullscreen && (
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-[#333] transition-colors"
          title="Fullscreen"
          onClick={onFullscreen}
        >
          <Maximize2 size={16} />
        </button>
      )}
    </div>
  );
}
