'use client';

import { memo, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useFlowStore } from '@/store/flowStore';
import { Play, Loader } from 'lucide-react';

export const SectionNode = memo(function SectionNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as Record<string, unknown>;
  const label = (data.label as string) || 'Section';
  const [running, setRunning] = useState(false);

  const handleRunSection = async () => {
    setRunning(true);
    try {
      const store = useFlowStore.getState();
      // Find all child nodes of this section
      const children = store.nodes.filter((n) => n.parentId === id);
      // Run dynamic nodes sequentially (they may depend on each other)
      for (const child of children) {
        const childData = child.data as Record<string, unknown>;
        if (childData.behavior === 'dynamic') {
          await store.runNode(child.id);
        }
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-[#333]"
        handleClassName="!w-2.5 !h-2.5 !bg-[#444] !border-[#666] !rounded-sm"
      />
      <div className="w-full h-full border border-[#2a2a2a] bg-[#0a0a0a]/60">
        {/* Header */}
        <div className="absolute -top-7 left-0 flex items-center gap-2">
          <input
            className="text-[12px] text-zinc-400 bg-[#171717] border border-[#2a2a2a] rounded-md px-2 py-0.5 outline-none max-w-[160px] nodrag"
            defaultValue={label}
            onChange={(e) => {
              useFlowStore.getState().updateNodeData(id, { label: e.target.value } as never);
            }}
          />
        </div>
        {/* Run button */}
        <div className="absolute -top-7 right-0">
          <button
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors nodrag ${
              running
                ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50'
                : 'bg-[#171717] text-zinc-300 border border-[#2a2a2a] hover:bg-[#212121] hover:text-white'
            }`}
            onClick={handleRunSection}
            disabled={running}
          >
            {running ? <><Loader size={11} className="animate-spin" /> Running...</> : <><Play size={11} /> Run Section</>}
          </button>
        </div>
      </div>
    </>
  );
});
