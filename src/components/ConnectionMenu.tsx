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

// Track recently selected nodes (persists across menu opens, resets on page reload)
const MAX_RECENT = 5;
let recentSelections: { type: FlowNodeType; label: string }[] = [
  { type: 'preview', label: 'Preview' }, // default
];

function addToRecent(type: FlowNodeType, label: string) {
  recentSelections = [
    { type, label },
    ...recentSelections.filter((r) => !(r.type === type && r.label === label)),
  ].slice(0, MAX_RECENT);
}

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

// Subcategory definition (mirrors sidebar)
interface SubCat {
  label: string;
  categories: string[];
}

const IMAGE_SUBS: SubCat[] = [
  { label: 'Generate Image', categories: ['Image Generation'] },
  { label: 'Edit Image', categories: ['Image Editing'] },
  { label: 'Enhance Image', categories: ['Upscale'] },
  { label: 'Image Utility', categories: ['Image Utility', 'Shared Utility'] },
];

const VIDEO_SUBS: SubCat[] = [
  { label: 'Generate Video', categories: ['Video Generation'] },
  { label: 'Edit Video', categories: ['Video Editing'] },
  { label: 'Motion Transfer', categories: ['Motion Transfer'] },
  { label: 'Lipsync', categories: ['Lipsync'] },
  { label: 'Enhance Video', categories: ['Video Upscale'] },
  { label: 'Extend Video', categories: ['Video Extend'] },
  { label: 'Video Utility', categories: ['Video Utility', 'Shared Utility'] },
];

const MENU_SECTIONS = [
  { label: 'Image', subs: IMAGE_SUBS },
  { label: 'Video', subs: VIDEO_SUBS },
];

export function ConnectionMenu({ position, sourceHandleType, onSelect, onClose }: ConnectionMenuProps) {
  const [search, setSearch] = useState('');
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (type: FlowNodeType, label: string) => {
    addToRecent(type, label);
    onSelect(type, label);
  };

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

  // Group compatible templates by category
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, typeof compatibleTemplates>();
    for (const t of compatibleTemplates) {
      const arr = map.get(t.category) || [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [compatibleTemplates]);

  // Get templates for a subcategory
  const getSubTemplates = (sub: SubCat) => {
    const templates: typeof compatibleTemplates = [];
    for (const cat of sub.categories) {
      const items = groupedByCategory.get(cat);
      if (items) templates.push(...items);
    }
    return templates;
  };

  // Check if flyout should go left instead of right
  const flyoutLeft = position.x + 280 + 240 > window.innerWidth;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#171717] border border-[#333] rounded-xl shadow-2xl w-[280px] flex flex-col"
      style={{ left: position.x, top: position.y, maxHeight: `${window.innerHeight - position.y - 16}px` }}
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
          searchResults.length > 0 ? (
            searchResults.map((t) => (
              <button
                key={`${t.type}-${t.label}`}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                onClick={() => handleSelect(t.type, t.label)}
              >
                <span className="text-[13px] text-zinc-300 flex-1 truncate">{t.label}</span>
                <span className="text-[10px] text-zinc-600">{t.category}</span>
              </button>
            ))
          ) : (
            <div className="text-center text-zinc-600 text-xs py-6">No compatible nodes found</div>
          )
        ) : (
          <>
            {/* Recent */}
            {recentSelections.length > 0 && (
              <div className="mb-1">
                <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Recent</div>
                {recentSelections
                  .filter((r) => compatibleTemplates.some((t) => t.type === r.type && t.label === r.label))
                  .map((r) => (
                    <button
                      key={`${r.type}-${r.label}`}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                      onClick={() => handleSelect(r.type, r.label)}
                      onMouseEnter={() => setHoveredSub(null)}
                    >
                      <span className="text-[13px] text-zinc-300">{r.label}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Add section with Essentials */}
            <div className="mb-1">
              <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Add</div>
              {/* Essentials as flyout */}
              {groupedByCategory.has('Essentials') && (
                <SubMenuItem
                  label="Essentials"
                  templates={groupedByCategory.get('Essentials')!.filter((t) => t.type !== 'prompt')}
                  isHovered={hoveredSub === 'Essentials'}
                  onHover={() => setHoveredSub('Essentials')}
                  onLeave={() => setHoveredSub(null)}
                  onSelect={handleSelect}
                  flyoutLeft={flyoutLeft}
                />
              )}
            </div>

            {/* Image / Video sections — hide Image for video source only */}
            {MENU_SECTIONS.filter((section) => {
              if (sourceHandleType === 'video' && section.label === 'Image') return false;
              return true;
            }).map((section) => {
              const subs = section.subs.filter((sub) =>
                sub.categories.some((c) => groupedByCategory.has(c))
              );
              if (subs.length === 0) return null;
              return (
                <div key={section.label} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    {section.label}
                  </div>
                  {subs.map((sub) => {
                    const templates = getSubTemplates(sub);
                    if (templates.length === 0) return null;
                    if (templates.length === 1) {
                      return (
                        <button
                          key={sub.label}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors"
                          onClick={() => handleSelect(templates[0].type, templates[0].label)}
                          onMouseEnter={() => setHoveredSub(null)}
                        >
                          <span className="text-[13px] text-zinc-300 flex-1">{sub.label}</span>
                        </button>
                      );
                    }
                    return (
                      <SubMenuItem
                        key={sub.label}
                        label={sub.label}
                        templates={templates}
                        isHovered={hoveredSub === sub.label}
                        onHover={() => setHoveredSub(sub.label)}
                        onLeave={() => setHoveredSub(null)}
                        onSelect={handleSelect}
                        flyoutLeft={flyoutLeft}
                      />
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** Subcategory row with flyout submenu on hover */
function SubMenuItem({
  label,
  templates,
  isHovered,
  onHover,
  onLeave,
  onSelect,
  flyoutLeft,
}: {
  label: string;
  templates: { type: FlowNodeType; label: string }[];
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: (type: FlowNodeType, templateLabel: string) => void;
  flyoutLeft: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (isHovered && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      const left = flyoutLeft ? rect.left - 224 : rect.right + 4;
      // Estimate flyout height: header (32px) + items (40px each) + padding (16px)
      const estimatedH = 32 + templates.length * 40 + 16;
      const top = rect.top + estimatedH > window.innerHeight
        ? Math.max(8, window.innerHeight - estimatedH - 8)
        : rect.top;
      setFlyoutPos({ top, left });
    }
  }, [isHovered, flyoutLeft, templates.length]);

  return (
    <div
      ref={rowRef}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#212121] text-left transition-colors">
        <span className="text-[13px] text-zinc-300 flex-1">{label}</span>
        <ChevronRight size={14} className="text-zinc-500" />
      </button>
      {isHovered && flyoutPos && (
        <div
          className="fixed z-[10000] bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl min-w-[220px] max-h-[360px] overflow-y-auto"
          style={{ top: flyoutPos.top - 8, left: flyoutPos.left, padding: '8px 0' }}
          onMouseEnter={onHover}
          onMouseLeave={onLeave}
        >
          <div className="px-3 py-1.5 text-[11px] font-medium text-zinc-500">{label}</div>
          {templates.map((t) => (
            <button
              key={`${t.type}-${t.label}`}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#252525] text-left transition-colors"
              onClick={() => onSelect(t.type, t.label)}
            >
              <span className="text-[13px] text-zinc-300">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
