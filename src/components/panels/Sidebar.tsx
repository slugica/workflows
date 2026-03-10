'use client';

import { useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { NODE_TEMPLATES, FlowNodeType } from '@/lib/types';
import { useFlowStore } from '@/store/flowStore';
import { Upload, Type, ImageIcon, Video, AudioLines, Bot, Zap, Pencil, Search, Wrench, MessageSquare, Crop, Download, ScanLine } from 'lucide-react';

// ── Quick-add buttons (top section) ──────────────────────────────────────────

const QUICK_ADD: { label: string; type: FlowNodeType; templateLabel: string; icon: ReactNode; shortcut: string }[] = [
  { label: 'Upload', type: 'import', templateLabel: 'Upload', icon: <Upload size={14} />, shortcut: 'U' },
  { label: 'Prompt', type: 'prompt', templateLabel: 'Prompt', icon: <Type size={14} />, shortcut: 'P' },
  { label: 'Image', type: 'import', templateLabel: 'Image', icon: <ImageIcon size={14} />, shortcut: 'I' },
  { label: 'Video', type: 'import', templateLabel: 'Video', icon: <Video size={14} />, shortcut: 'V' },
  { label: 'AI Copilot', type: 'textUtility', templateLabel: 'AI Copilot', icon: <Bot size={14} />, shortcut: 'C' },
];

// ── Sidebar structure: sections → subcategories → models ─────────────────────

interface SubCategory {
  label: string;
  icon: ReactNode;
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
      { label: 'Essentials', icon: <Zap size={14} />, categories: ['Essentials'] },
    ],
  },
  {
    label: 'Image',
    subs: [
      { label: 'Generate Image', icon: <ImageIcon size={14} />, categories: ['Image Generation'] },
      { label: 'Edit Image', icon: <Pencil size={14} />, categories: ['Image Editing'] },
      { label: 'Enhance Image', icon: <Search size={14} />, categories: ['Upscale'] },
      { label: 'Image Utility', icon: <Wrench size={14} />, categories: ['Utility'] },
    ],
  },
  {
    label: 'Video',
    subs: [
      { label: 'Generate Video', icon: <Video size={14} />, categories: ['Video Generation'] },
    ],
  },
  {
    label: 'Text',
    subs: [
      { label: 'Text', icon: <MessageSquare size={14} />, categories: ['Text'] },
    ],
  },
];

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const addNode = useFlowStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

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
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNode(type, label, {
      x: center.x + (Math.random() - 0.5) * 100,
      y: center.y + (Math.random() - 0.5) * 100,
    });
  };

  // Search mode: flat list of all matching templates
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const results = NODE_TEMPLATES.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
    return (
      <div className="w-[280px] bg-[#0F0F0F] border-r border-[#212121] flex flex-col h-full">
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
    <div className="w-[280px] bg-[#0F0F0F] border-r border-[#212121] flex flex-col h-full">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <div className="flex-1 overflow-y-auto">
        {/* Quick-add section */}
        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Add</div>
          <div className="space-y-0.5">
            {QUICK_ADD.map((item) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#212121]/70 transition-colors text-left group"
                onClick={() => handleAdd(item.type, item.templateLabel)}
              >
                <span className="w-8 h-8 rounded-lg bg-[#212121] flex items-center justify-center text-sm group-hover:bg-[#2a2a2a] transition-colors">
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#212121]/70 transition-colors text-left group"
                      onClick={() => handleAdd(t.type, t.label)}
                    >
                      <span className="w-8 h-8 rounded-lg bg-[#212121] flex items-center justify-center text-sm group-hover:bg-[#2a2a2a] transition-colors">
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
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#212121]/70 transition-colors text-left group ${
                        isOpen ? 'bg-[#212121]/50' : ''
                      }`}
                      onClick={() => toggleSub(sub.label)}
                    >
                      <span className="w-8 h-8 rounded-lg bg-[#212121] flex items-center justify-center text-sm group-hover:bg-[#2a2a2a] transition-colors">
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
    <div className="p-3 border-b border-[#212121]">
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
          className="w-full bg-[#171717] text-zinc-300 text-xs rounded-lg pl-8 pr-3 py-2 border border-[#212121] focus:border-[#333] focus:outline-none"
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
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#212121]/70 cursor-grab active:cursor-grabbing transition-colors group"
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
    >
      <span className="w-6 h-6 rounded-md bg-[#212121] flex items-center justify-center text-[11px] group-hover:bg-[#2a2a2a] transition-colors">
        {type === 'image' ? <ImageIcon size={11} /> : type === 'video' ? <Video size={11} /> : type === 'audio' ? <AudioLines size={11} /> : type === 'prompt' ? <Type size={11} /> : type === 'import' ? <Upload size={11} /> : type === 'crop' ? <Crop size={11} /> : type === 'export' ? <Download size={11} /> : type === 'preview' ? <ScanLine size={11} /> : <Bot size={11} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-300 truncate">{label}</div>
        {category && <div className="text-[10px] text-zinc-600">{category}</div>}
      </div>
    </div>
  );
}
