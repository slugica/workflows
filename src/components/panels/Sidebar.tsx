'use client';

import { useState } from 'react';
import { NODE_TEMPLATES, FlowNodeType } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';

// ── Quick-add buttons (top section) ──────────────────────────────────────────

const QUICK_ADD = [
  { label: 'Upload', type: 'import' as FlowNodeType, templateLabel: 'Upload', icon: '📁', shortcut: 'U' },
  { label: 'Prompt', type: 'prompt' as FlowNodeType, templateLabel: 'Prompt', icon: '✏️', shortcut: 'P' },
  { label: 'Image', type: 'import' as FlowNodeType, templateLabel: 'Image', icon: '🖼️', shortcut: 'I' },
  { label: 'Video', type: 'import' as FlowNodeType, templateLabel: 'Video', icon: '🎬', shortcut: 'V' },
  { label: 'AI Copilot', type: 'textUtility' as FlowNodeType, templateLabel: 'AI Copilot', icon: '🤖', shortcut: 'C' },
];

// ── Sidebar structure: sections → subcategories → models ─────────────────────

interface SubCategory {
  label: string;
  icon: string;
  categories: string[]; // maps to NODE_TEMPLATES category values
}

interface Section {
  label: string;
  subs: SubCategory[];
}

const SECTIONS: Section[] = [
  {
    label: 'Essentials',
    subs: [
      { label: 'Essentials', icon: '⚡', categories: ['Essentials'] },
    ],
  },
  {
    label: 'Image',
    subs: [
      { label: 'Generate Image', icon: '🖼️', categories: ['Image Generation'] },
      { label: 'Edit Image', icon: '✏️', categories: ['Image Editing'] },
      { label: 'Enhance Image', icon: '🔎', categories: ['Upscale'] },
      { label: 'Image Utility', icon: '🛠️', categories: ['Utility'] },
    ],
  },
  {
    label: 'Video',
    subs: [
      { label: 'Generate Video', icon: '🎬', categories: ['Video Generation'] },
    ],
  },
  {
    label: 'Text',
    subs: [
      { label: 'Text', icon: '💬', categories: ['Text'] },
    ],
  },
];

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const addNode = useFlowStore((s) => s.addNode);

  const toggleSub = (label: string) => {
    setOpenSubs((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, type: FlowNodeType, label: string) => {
    e.dataTransfer.setData('application/flow-node-type', type);
    e.dataTransfer.setData('application/flow-node-label', label);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAdd = (type: FlowNodeType, label: string) => {
    addNode(type, label, {
      x: 300 + Math.random() * 200,
      y: 200 + Math.random() * 200,
    });
  };

  // Search mode: flat list of all matching templates
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const results = NODE_TEMPLATES.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
    return (
      <div className="w-[280px] bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
        <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {results.map((t) => (
            <ModelItem
              key={`${t.type}-${t.label}`}
              label={t.label}
              category={t.category}
              type={t.type}
              onAdd={() => handleAdd(t.type, t.label)}
              onDragStart={(e) => handleDragStart(e, t.type, t.label)}
            />
          ))}
          {results.length === 0 && (
            <div className="text-center text-zinc-600 text-xs py-8">No nodes found</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <div className="flex-1 overflow-y-auto">
        {/* Quick-add section */}
        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Add</div>
          <div className="space-y-0.5">
            {QUICK_ADD.map((item) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/70 transition-colors text-left group"
                onClick={() => handleAdd(item.type, item.templateLabel)}
              >
                <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm group-hover:bg-zinc-700 transition-colors">
                  {item.icon}
                </span>
                <span className="text-sm text-zinc-300 flex-1">{item.label}</span>
                <span className="text-[11px] text-zinc-600 font-mono">{item.shortcut}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sections with subcategories */}
        {SECTIONS.map((section) => {
          const sectionTemplates = NODE_TEMPLATES.filter((t) =>
            section.subs.some((sub) => sub.categories.includes(t.category))
          );
          if (sectionTemplates.length === 0) return null;

          return (
            <div key={section.label} className="mt-3">
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  {section.label}
                </span>
              </div>

              {section.subs.map((sub) => {
                const templates = NODE_TEMPLATES.filter((t) =>
                  sub.categories.includes(t.category)
                );
                if (templates.length === 0) return null;

                const isOpen = openSubs.has(sub.label);

                // If subcategory has only static nodes (Essentials, Text), show them inline
                const isSimple = templates.length <= 2 && section.label === 'Essentials';
                if (isSimple) {
                  return templates.map((t) => (
                    <button
                      key={`${t.type}-${t.label}`}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/70 transition-colors text-left group"
                      onClick={() => handleAdd(t.type, t.label)}
                    >
                      <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm group-hover:bg-zinc-700 transition-colors">
                        {sub.icon}
                      </span>
                      <span className="text-sm text-zinc-300 flex-1">{t.label}</span>
                    </button>
                  ));
                }

                return (
                  <div key={sub.label}>
                    {/* Subcategory header (accordion toggle) */}
                    <button
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/70 transition-colors text-left group ${
                        isOpen ? 'bg-zinc-800/50' : ''
                      }`}
                      onClick={() => toggleSub(sub.label)}
                    >
                      <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm group-hover:bg-zinc-700 transition-colors">
                        {sub.icon}
                      </span>
                      <span className="text-sm text-zinc-300 flex-1">{sub.label}</span>
                      <svg
                        className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded model list */}
                    {isOpen && (
                      <div className="pl-4 pr-2 pb-1">
                        {templates.map((t) => (
                          <ModelItem
                            key={`${t.type}-${t.label}`}
                            label={t.label}
                            type={t.type}
                            onAdd={() => handleAdd(t.type, t.label)}
                            onDragStart={(e) => handleDragStart(e, t.type, t.label)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Header({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}) {
  return (
    <div className="p-3 border-b border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Nodes</h2>
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search nodes or models"
          className="w-full bg-zinc-900 text-zinc-300 text-xs rounded-lg pl-8 pr-3 py-2 border border-zinc-800 focus:border-zinc-600 focus:outline-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
    </div>
  );
}

function ModelItem({
  label,
  category,
  type,
  onAdd,
  onDragStart,
}: {
  label: string;
  category?: string;
  type: FlowNodeType;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-800/70 cursor-grab active:cursor-grabbing transition-colors group"
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
    >
      <span className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center text-[11px] group-hover:bg-zinc-700 transition-colors">
        {type === 'image' ? '🖼️' : type === 'video' ? '🎬' : type === 'audio' ? '🎵' : type === 'prompt' ? '✏️' : type === 'import' ? '📁' : '🤖'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-300 truncate">{label}</div>
        {category && <div className="text-[10px] text-zinc-600">{category}</div>}
      </div>
    </div>
  );
}
