// Centralized design tokens — based on Imagine.art's design system
// All components should import from here instead of hardcoding colors/sizes

export const theme = {
  // ── Surfaces ──
  canvas:        '#0f0f0f',
  surface1:      '#171717',  // node bg, toolbars, top bar, input bg
  surface2:      '#212121',  // preview areas, dropdowns, secondary bg
  surface3:      '#1a1a1a',  // floating toolbars, menus
  surfaceHover:  '#2a2a2a',  // hover states
  surfaceActive: '#333333',  // active/pressed, dividers

  // ── Borders ──
  border1:       '#212121',  // primary borders
  border2:       '#292929',  // secondary borders (buttons, inputs)
  border3:       '#333333',  // toolbar borders, dividers

  // ── Content ──
  contentPrimary:   '#ffffff',
  contentSecondary: '#bdbdbd',
  contentTertiary:  'rgba(255,255,255,0.5)',
  contentDisabled:  'rgba(189,189,189,0.3)',

  // ── Node Card ──
  nodeWidth:           356,
  nodeRadius:          24,    // px
  nodeBorderWidth:     '2px',
  nodeBorderColor:     '#212121',
  nodeBorderSelected:  'rgba(255,255,255,0.3)',
  nodePadding:         '12px 16px 16px',

  // ── Preview Area ──
  previewBg:     '#212121',
  previewRadius: 16,    // px

  // ── Handles ──
  handleSize:        18,    // px
  handleBorderWidth: '2px',
  handleBorderColor: '#171717',
  handleGap:         24,    // px between handles

  // ── Controls (from Imagine.art extraction) ──
  control: {
    // Number input (e.g. W/H in Resize, shadow/gamma/highlight in Levels)
    numberInput:  { height: 32, radius: 12, paddingX: 10, paddingY: 6, fontSize: 16, width: 72 },
    // Narrow number input (e.g. filter values)
    numberNarrow: { height: 32, radius: 12, paddingX: 10, paddingY: 6, fontSize: 16, width: 56 },
    // Wide number input
    numberWide:   { height: 32, radius: 12, paddingX: 10, paddingY: 6, fontSize: 16, width: 80 },
    // Select / dropdown
    select:       { height: 32, radius: 12, paddingX: 10, paddingY: 6, fontSize: 14 },
    // Slider
    slider:       { trackHeight: 4, thumbSize: 16 },
    // Icon button (small square)
    iconBtn:      { size: 32, radius: 12 },
    // Run button
    runBtn:       { height: 40, radius: 16, paddingX: 12, paddingY: 10, fontSize: 16 },
    // Reset button
    resetBtn:     { height: 28, radius: 10, paddingX: 8, paddingY: 6, fontSize: 12 },
    // Controls area gap
    gap: 8,
  },

  // ── Buttons ──
  btnRunHeight:    40,
  btnRunRadius:    16,
  btnRunBorder:    '#292929',
  btnIconSize:     32,
  btnIconRadius:   '9999px',   // fully round
  btnResetRadius:  10,

  // ── Toolbars (floating: quick actions, section, multi-select) ──
  toolbarBg:       '#1a1a1a',
  toolbarBorder:   '#333333',
  toolbarRadius:   '9999px',
  toolbarBtnSize:  32,   // w-8 h-8

  // ── Bottom Bar ──
  bottomBarBg:     '#171717',
  bottomBarBorder: '#212121',
  bottomBarRadius: 20,
  bottomBarHeight: 48,

  // ── Panels (Sidebar, Properties) ──
  panelBg:     '#0f0f0f',
  panelBorder: '#212121',

  // ── Typography ──
  font: {
    nodeTitle:    { size: 16, weight: 500, lineHeight: '20px' },
    handleLabel:  { size: 14, weight: 500, lineHeight: '20px' },
    body:         { size: 14, weight: 400, lineHeight: '20px' },
    small:        { size: 12, weight: 400 },
    label:        { size: 11, weight: 400, letterSpacing: '0.03em' },
    category:     { size: 10, weight: 500, letterSpacing: '0.05em' },
  },

  // ── Section Colors ──
  sectionColors: [
    '#555555', // gray (default)
    '#3b82f6', // blue
    '#22c55e', // green
    '#ef4444', // red
    '#a855f7', // purple
    '#84cc16', // lime
    '#ec4899', // pink
    '#f97316', // orange
    '#06b6d4', // cyan
  ],
} as const;

// ── Tailwind-compatible class fragments ──
// Use these in className strings for common patterns

export const nodeCardClasses = {
  base: `bg-[${theme.surface1}] rounded-[${theme.nodeRadius}px] border-[${theme.nodeBorderWidth}] border-[${theme.border1}]`,
  selected: `border-[rgba(255,255,255,0.3)]`,
};
