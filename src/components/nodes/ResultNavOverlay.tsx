'use client';

import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useFlowStore } from '@/store/flowStore';
import type { FlowNodeData } from '@/lib/types';

interface ResultNavOverlayProps {
  nodeId: string;
  results: FlowNodeData['results'];
  selectedResultIndex: number;
}

/**
 * Shared overlay for navigating and deleting accumulated results (images, videos).
 * Shows on hover: < 1/3 > navigation + delete button.
 */
export function ResultNavOverlay({ nodeId, results, selectedResultIndex }: ResultNavOverlayProps) {
  if (!results || results.length === 0) return null;

  const currentEntry = results[selectedResultIndex];
  const currentMeta = currentEntry ? Object.values(currentEntry)[0] : null;
  const isLoading = currentMeta?.loading === true;

  return (
    <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 opacity-0 group-hover/preview:opacity-100 transition-opacity duration-200">
      <div className="flex items-center gap-1">
        <button
          className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            const prev = selectedResultIndex - 1;
            if (prev >= 0) useFlowStore.getState().updateNodeData(nodeId, { selectedResultIndex: prev });
          }}
        >
          <ChevronLeft size={14} className="text-white" />
        </button>
        <span className="text-xs text-white font-medium px-1">
          {selectedResultIndex + 1}/{results.length}
        </span>
        <button
          className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center nodrag transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            const next = selectedResultIndex + 1;
            if (next < results.length) useFlowStore.getState().updateNodeData(nodeId, { selectedResultIndex: next });
          }}
        >
          <ChevronRight size={14} className="text-white" />
        </button>
      </div>
      {!isLoading && (
        <button
          className="w-7 h-7 rounded-full bg-black/60 hover:bg-red-900/80 flex items-center justify-center nodrag transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            const newResults = results.filter((_, i) => i !== selectedResultIndex);
            const newIdx = Math.min(selectedResultIndex, newResults.length - 1);
            useFlowStore.getState().updateNodeData(nodeId, {
              results: newResults,
              selectedResultIndex: Math.max(0, newIdx),
              ...(newResults.length === 0 ? { status: 'idle' as const } : {}),
            });
          }}
        >
          <Trash2 size={12} className="text-white" />
        </button>
      )}
    </div>
  );
}
