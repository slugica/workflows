'use client';

import { useEffect, useRef } from 'react';
import { useFlowStore } from '@/store/flowStore';
import { FlowNodeData } from '@/lib/types';
import { theme } from '@/lib/theme';

const STORAGE_KEY = 'flow-editor-autosave';

export function Toolbar() {
  const { toJSON, loadJSON, nodes } = useFlowStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLoaded = useRef(false);

  // Auto-load on mount
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      loadJSON(saved);
    }
  }, [loadJSON]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = toJSON();
      localStorage.setItem(STORAGE_KEY, json);
    }, 500);
    return () => clearTimeout(timer);
  });

  const handleExport = () => {
    const json = toJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) loadJSON(text);
    };
    reader.readAsText(file);
    // Reset so same file can be re-imported
    e.target.value = '';
  };

  const handleNew = () => {
    loadJSON(JSON.stringify({ graph: { nodes: [], edges: [] } }));
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleRunAll = async () => {
    const store = useFlowStore.getState();
    const dynamicNodes = nodes.filter(
      (n) => (n.data as unknown as FlowNodeData).behavior === 'dynamic'
    );
    // Run all in parallel
    for (const node of dynamicNodes) {
      store.runNode(node.id);
    }
  };

  return (
    <div className="h-12 flex items-center justify-between px-4" style={{ backgroundColor: theme.panelBg, borderBottom: `1px solid ${theme.panelBorder}` }}>
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold text-zinc-200">Flow Editor</h1>
        <span className="text-[10px] text-zinc-600 px-2 py-0.5 rounded" style={{ backgroundColor: theme.surface2 }}>
          prototype
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleNew}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-300 transition-colors hover:brightness-125"
          style={{ backgroundColor: theme.surface2 }}
        >
          New
        </button>
        <button
          onClick={handleImport}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-300 transition-colors hover:brightness-125"
          style={{ backgroundColor: theme.surface2 }}
        >
          Import
        </button>
        <button
          onClick={handleExport}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-300 transition-colors hover:brightness-125"
          style={{ backgroundColor: theme.surface2 }}
        >
          Export
        </button>
        <button
          onClick={handleRunAll}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors font-medium"
        >
          ▶ Run All
        </button>
      </div>
    </div>
  );
}
