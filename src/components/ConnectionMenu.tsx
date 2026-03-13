'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { NODE_TEMPLATES, type FlowNodeType, type HandleDataType } from '@/lib/types';
import { Search, ChevronRight } from 'lucide-react';

interface ConnectionMenuProps {
  position: { x: number; y: number };
  sourceHandleType: HandleDataType;
  onSelect: (type: FlowNodeType, templateLabel: string) => void;
  onClose: () => void;
}

// Which categories are compatible with each source handle type
const COMPATIBLE_CATEGORIES: Record<string, string[]> = {
  image: [
    'Essentials', 'Image Generation', 'Image Editing', 'Upscale', 'Utility',
    'Video Generation', 'Motion Transfer', 'Lipsync',
    'Image Utility', 'Shared Utility',
  ],
  video: [
    'Essentials', 'Video Upscale', 'Video Extend', 'Video Editing', 'Motion Transfer', 'Lipsync',
    'Video Utility', 'Shared Utility',
  ],
  file: [
    'Essentials', 'Image Generation', 'Image Editing', 'Upscale', 'Utility',
    'Video Generation', 'Video Upscale', 'Video Extend', 'Video Editing', 'Motion Transfer', 'Lipsync',
    'Image Utility', 'Video Utility', 'Shared Utility',
  ],
  text: [
    'Essentials', 'Image Generation', 'Image Editing', 'Video Generation',
    'Video Editing', 'Video Extend', 'Motion Transfer', 'Lipsync',
  ],
  audio: [
    'Essentials', 'Lipsync',
  ],
};

// Check if a template has a compatible input for the source type
function isCompatible(template: { type: FlowNodeType; defaultData: { handles?: { inputs: { type: HandleDataType }[] } } }, sourceType: HandleDataType): boolean {
  const inputs = template.defaultData.handles?.inputs;
  if (!inputs) return false;
  const mediaTypes = new Set(['file', 'image', 'video', 'audio']);
  return inputs.some((h) => {
    if (h.type === sourceType) return true;
    if (mediaTypes.has(sourceType) && mediaTypes.has(h.type)) return h.type === 'file' || sourceType === 'file';
    return false;
  });
}

// Section groupings for the menu
const MENU_SECTIONS = [
  {
    label: 'Image',
    categories: ['Image Generation', 'Image Editing', 'Upscale', 'Utility', 'Image Utility', 'Shared Utility'],
  },
  {
    label: 'Video',
    categories: ['Video Generation', 'Video Editing', 'Video Upscale', 'Video Extend', 'Motion Transfer', 'Lipsync', 'Video Utility'],
  },
];

export function ConnectionMenu({ position, sourceHandleType, onSelect, onClose }: ConnectionMenuProps) {
  const [search, setSearch] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter templates by compatibility
  const compatibleTemplates = useMemo(() => {
    return NODE_TEMPLATES.filter((t) => {
      if (t.type === 'section') return false;
      return isCompatible(t as Parameters<typeof isCompatible>[0], sourceHandleType as HandleDataType);
    });
  }, [sourceHandleType]);

  // Search results
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return compatibleTemplates.filter(
      (t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
  }, [search, compatibleTemplates]);

  // Group compatible templates by category for browsing
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, typeof compatibleTemplates>();
    for (const t of compatibleTemplates) {
      const arr = map.get(t.category) || [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [compatibleTemplates]);

  // Quick add items
  const quickItems = useMemo(() => {
    const items: { label: string; type: FlowNodeType; templateLabel: string }[] = [];
    items.push({ label: 'Preview', type: 'preview', templateLabel: 'Preview' });
    return items.filter((item) =>
      compatibleTemplates.some((t) => t.type === item.type && t.label === item.templateLabel)
    );
  }, [compatibleTemplates]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#171717] border border-[#333] rounded-xl shadow-2xl w-[280px] max-h-[420px] flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      {/* Search */}
      <div className="p-2 border-b border-[#252525]">
        <div className="flex items-center gap-2 bg-[#212121] rounded-lg px-3 py-2">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            className="bg-transparent text-sm text-white outline-none flex-1 placeholder-zinc-500"
            placeholder="Search nodes or models"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {searchResults ? (
          /* Search results */
          searchResults.length > 0 ? (
            searchResults.map((t) => (
              <button
                key={`${t.type}-${t.label}`}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                onClick={() => onSelect(t.type, t.label)}
              >
                <span className="text-[13px] text-zinc-300 flex-1 truncate">{t.label}</span>
                <span className="text-[10px] text-zinc-600">{t.category}</span>
              </button>
            ))
          ) : (
            <div className="text-center text-zinc-600 text-xs py-6">No compatible nodes found</div>
          )
        ) : (
          /* Browse mode */
          <>
            {/* Quick items */}
            {quickItems.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Recent</div>
                {quickItems.map((item) => (
                  <button
                    key={item.templateLabel}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                    onClick={() => onSelect(item.type, item.templateLabel)}
                  >
                    <span className="text-[13px] text-zinc-300">{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Sections */}
            {MENU_SECTIONS.map((section) => {
              const sectionCategories = section.categories.filter((c) => groupedByCategory.has(c));
              if (sectionCategories.length === 0) return null;
              return (
                <div key={section.label} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    {section.label}
                  </div>
                  {sectionCategories.map((cat) => {
                    const templates = groupedByCategory.get(cat)!;
                    const isExpanded = expandedCategory === cat;
                    return (
                      <div key={cat}>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                          onClick={() => {
                            if (templates.length === 1) {
                              onSelect(templates[0].type, templates[0].label);
                            } else {
                              setExpandedCategory(isExpanded ? null : cat);
                            }
                          }}
                        >
                          <span className="text-[13px] text-zinc-300 flex-1">{cat}</span>
                          {templates.length > 1 && (
                            <ChevronRight
                              size={14}
                              className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          )}
                        </button>
                        {isExpanded && templates.length > 1 && (
                          <div className="bg-[#0f0f0f]">
                            {templates.map((t) => (
                              <button
                                key={`${t.type}-${t.label}`}
                                className="w-full flex items-center gap-2 pl-6 pr-3 py-1.5 hover:bg-[#212121] text-left transition-colors"
                                onClick={() => onSelect(t.type, t.label)}
                              >
                                <span className="text-[12px] text-zinc-400">{t.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Essentials / Utility that don't fit in sections */}
            {groupedByCategory.has('Essentials') && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Essentials</div>
                {groupedByCategory.get('Essentials')!.map((t) => (
                  <button
                    key={`${t.type}-${t.label}`}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                    onClick={() => onSelect(t.type, t.label)}
                  >
                    <span className="text-[13px] text-zinc-300">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
