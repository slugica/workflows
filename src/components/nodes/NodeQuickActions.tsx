'use client';

import { useState } from 'react';
import { QuickActionsBar, type QuickActionMode } from './QuickActionsBar';
import type { FlowNodeData } from '@/lib/types';

interface NodeQuickActionsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  nodeId: string;
  selected: boolean;
  data: FlowNodeData;
  children: React.ReactNode;
  fileUrl?: string;
  onFullscreen?: () => void;
}

/** Wrapper that adds QuickActionsBar with hover tracking to any node */
export function NodeQuickActions({ nodeId, selected, data, children, fileUrl, onFullscreen, className, ...rest }: NodeQuickActionsProps) {
  const [hovered, setHovered] = useState(false);

  // Detect mode from output handles
  let mode: QuickActionMode = 'image';
  const outputs = data.handles?.outputs;
  if (outputs) {
    const hasVideo = outputs.some((h) => h.type === 'video');
    if (hasVideo) mode = 'video';
    // For file type, check settings
    if (!hasVideo && outputs.some((h) => h.type === 'file')) {
      const ft = data.settings?.fileType as string | undefined;
      if (ft?.startsWith('video/') || ft === 'video') mode = 'video';
    }
  }

  return (
    <div
      className={className ?? "group relative flex flex-col items-center gap-1"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...rest}
    >
      <QuickActionsBar
        nodeId={nodeId}
        selected={selected}
        hovered={hovered}
        mode={mode}
        fileUrl={fileUrl}
        onFullscreen={onFullscreen}
      />
      {children}
    </div>
  );
}
