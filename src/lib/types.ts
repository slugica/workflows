export type HandleDataType = 'image' | 'text' | 'video' | 'audio' | 'file';

export interface HandleDef {
  id: string;
  key: string;
  label: string;
  type: HandleDataType;
  required?: boolean;
  /** If true, connecting this handle spawns a new empty one below (up to maxDynamic) */
  dynamic?: boolean;
  maxDynamic?: number;
  /** Base key for dynamic handles (e.g. "ref" for ref_1, ref_2...) */
  dynamicBase?: string;
}

export interface NodeResult {
  [key: string]: {
    content: string;
    format: string;
    [key: string]: unknown;
  };
}

export interface FlowNodeData {
  name: string;
  behavior: 'static' | 'dynamic';
  handles: {
    inputs: HandleDef[];
    outputs: HandleDef[];
  };
  settings: Record<string, unknown>;
  outputs: Record<string, unknown>;
  results: NodeResult[];
  selectedResultIndex: number;
  status?: 'idle' | 'running' | 'done' | 'error';
  errorMessage?: string;
}

export type FlowNodeType = 'import' | 'prompt' | 'image' | 'video' | 'audio' | 'crop' | 'export' | 'preview' | 'blur' | 'resize' | 'filters' | 'levels' | 'splitImage' | 'imageIterator' | 'aiResize' | 'relight' | 'cameraAngles' | 'section' | 'extractFrame' | 'trimVideo' | 'combineAudioVideo' | 'combineVideo' | 'videoIterator';

export interface NodeTemplate {
  type: FlowNodeType;
  label: string;
  category: string;
  defaultData: Partial<FlowNodeData>;
}

export const HANDLE_COLORS: Record<HandleDataType, string> = {
  image: '#FCB84A',
  text: '#3CB8FF',
  video: '#4ADE80',
  audio: '#F472B6',
  file: '#9CA3AF',
};

/** Detect media color from a node's settings/results. Returns null if unknown. */
/** Detect the actual media type of a node's content at runtime */
export function detectMediaType(nodeData: FlowNodeData): 'image' | 'video' | 'audio' | null {
  const ft = nodeData.settings?.fileType as string | undefined;
  if (ft?.startsWith('video/')) return 'video';
  if (ft?.startsWith('image/')) return 'image';
  if (ft?.startsWith('audio/')) return 'audio';
  if (nodeData.results?.length) {
    const result = nodeData.results[nodeData.selectedResultIndex || 0];
    if (result) {
      const entry = Object.values(result)[0];
      if (entry?.format === 'video') return 'video';
      if (entry?.format === 'image') return 'image';
      if (entry?.format === 'audio') return 'audio';
    }
  }
  return null;
}

function detectMediaColor(nodeData: FlowNodeData): string | null {
  const ft = nodeData.settings.fileType as string | undefined;
  if (ft?.startsWith('video/')) return HANDLE_COLORS.video;
  if (ft?.startsWith('image/')) return HANDLE_COLORS.image;
  if (ft?.startsWith('audio/')) return HANDLE_COLORS.audio;
  if (nodeData.results?.length) {
    const result = nodeData.results[nodeData.selectedResultIndex || 0];
    if (result) {
      const entry = Object.values(result)[0];
      if (entry?.format === 'video') return HANDLE_COLORS.video;
      if (entry?.format === 'image') return HANDLE_COLORS.image;
      if (entry?.format === 'audio') return HANDLE_COLORS.audio;
    }
  }
  return null;
}

/**
 * Resolve the effective color for a `file` type handle based on media context.
 * Returns the media-specific color (video=green, image=yellow) or default file color (gray).
 */
export function resolveFileHandleColor(
  direction: 'input' | 'output',
  nodeData: FlowNodeData,
  handleId: string,
  edges: import('@xyflow/react').Edge[],
  nodeId: string,
  allNodes?: import('@xyflow/react').Node[],
): string {
  if (direction === 'output') {
    const own = detectMediaColor(nodeData);
    if (own) return own;
    // Pass-through: inherit color from connected input's source
    if (allNodes) {
      const inEdge = edges.find(e => e.target === nodeId && e.targetHandle &&
        (e.targetHandle.includes('input:file') || e.targetHandle.includes('input:image') || e.targetHandle.includes('input:video'))
      );
      if (inEdge) {
        const srcNode = allNodes.find(n => n.id === inEdge.source);
        if (srcNode) {
          const srcColor = detectMediaColor(srcNode.data as unknown as FlowNodeData);
          if (srcColor) return srcColor;
        }
      }
    }
    return HANDLE_COLORS.file;
  }

  // Input handle: check what's connected
  const edge = edges.find(e => e.target === nodeId && e.targetHandle === handleId);
  if (!edge?.sourceHandle) return HANDLE_COLORS.file;

  // Parse source handle: {nodeId}|output:{type}:{key}
  const parts = edge.sourceHandle.split('|');
  if (parts.length === 2) {
    const segs = parts[1].split(':');
    if (segs.length === 3) {
      const srcType = segs[1] as HandleDataType;
      if (srcType !== 'file') return HANDLE_COLORS[srcType] || HANDLE_COLORS.file;
    }
  }

  // Source is also `file` — check source node's data
  if (allNodes) {
    const srcNode = allNodes.find(n => n.id === edge.source);
    if (srcNode) {
      const srcColor = detectMediaColor(srcNode.data as unknown as FlowNodeData);
      if (srcColor) return srcColor;
    }
  }

  return HANDLE_COLORS.file;
}

import { MODEL_REGISTRY, getDefaultSettings } from './modelRegistry';

/** Static (non-model) templates */
const STATIC_TEMPLATES: NodeTemplate[] = [
  {
    type: 'import',
    label: 'Import',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: { allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/mov', 'audio/mpeg', 'audio/wav'] },
    },
  },
  {
    type: 'prompt',
    label: 'Prompt',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'prompt', label: 'Input', type: 'text', required: false }],
        outputs: [{ id: '', key: 'prompt', label: 'Prompt', type: 'text' }],
      },
      settings: {},
    },
  },
  {
    type: 'preview',
    label: 'Preview',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: false }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'export',
    label: 'Export',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'Input', type: 'file', required: true }],
        outputs: [],
      },
      settings: { fileType: 'png', scale: 1 },
    },
  },
  {
    type: 'crop',
    label: 'Crop',
    category: 'Shared Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: true }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'resize',
    label: 'Resize',
    category: 'Shared Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: true }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'blur',
    label: 'Blur',
    category: 'Shared Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: true }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'levels',
    label: 'Levels',
    category: 'Shared Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: true }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'filters',
    label: 'Filters',
    category: 'Shared Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'File', type: 'file', required: true }],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: {},
    },
  },
  {
    type: 'aiResize',
    label: 'AI Resize',
    category: 'Image Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'imageUrl', label: 'Reference Image', type: 'image', required: true }],
        outputs: [{ id: '', key: 'image', label: 'Image', type: 'image' }],
      },
      settings: { aspectRatio: '1:1' },
    },
  },
  {
    type: 'relight',
    label: 'Relight',
    category: 'Image Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'imageUrl', label: 'Reference Image', type: 'image', required: true }],
        outputs: [{ id: '', key: 'image', label: 'Image', type: 'image' }],
      },
      settings: { azimuth: 0, elevation: 0, lightIntensity: 7, colorHex: '#ffffff', aspectRatio: '3:4', resolution: '1K' },
    },
  },
  {
    type: 'cameraAngles',
    label: 'Multiple Camera Angles',
    category: 'Image Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [
          { id: '', key: 'imageUrl', label: 'Image', type: 'image', required: true },
          { id: '', key: 'negativePrompt', label: 'Negative Prompt', type: 'text', required: false },
        ],
        outputs: [{ id: '', key: 'image', label: 'Image', type: 'image' }],
      },
      settings: {
        rotateRightLeft: 0,
        verticalAngle: 0,
        moveForward: 5,
        wideAngleLens: false,
        guidanceScale: 4.5,
        enableSafetyChecker: false,
        aspectRatio: '3:4',
        resolution: '1K',
      },
    },
  },
  {
    type: 'imageIterator',
    label: 'Image Iterator',
    category: 'Image Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'image_1', label: 'Input', type: 'image', required: false, dynamic: true, maxDynamic: 20, dynamicBase: 'image' }],
        outputs: [{ id: '', key: 'output', label: 'Output', type: 'image' }],
      },
      settings: {},
    },
  },
  {
    type: 'splitImage',
    label: 'Split Image',
    category: 'Image Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'Input', type: 'image', required: true }],
        outputs: [],
      },
      settings: {},
    },
  },
  // ── Video Utility ─────────────────────────────────────────────────────────
  {
    type: 'extractFrame',
    label: 'Extract Video Frame',
    category: 'Video Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'file', label: 'Video', type: 'video', required: true }],
        outputs: [{ id: '', key: 'frame', label: 'Image', type: 'image' }],
      },
      settings: { timestamp: 0 },
    },
  },
  {
    type: 'trimVideo',
    label: 'Trim Video',
    category: 'Video Utility',
    defaultData: {
      behavior: 'dynamic',
      handles: {
        inputs: [{ id: '', key: 'video', label: 'Video', type: 'video', required: true }],
        outputs: [{ id: '', key: 'video', label: 'Video', type: 'video' }],
      },
      settings: { startTime: 0, endTime: 0, duration: 0, previewTime: 0, segments: [] },
    },
  },
  {
    type: 'combineAudioVideo',
    label: 'Combine Audio Video',
    category: 'Video Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [
          { id: '', key: 'video', label: 'Video', type: 'video', required: true },
          { id: '', key: 'audio', label: 'Audio', type: 'audio', required: true },
        ],
        outputs: [{ id: '', key: 'file', label: 'Video', type: 'video' }],
      },
      settings: {},
    },
  },
  {
    type: 'combineVideo',
    label: 'Combine Video',
    category: 'Video Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'video_1', label: 'Video', type: 'video', required: false, dynamic: true, maxDynamic: 10, dynamicBase: 'video' }],
        outputs: [{ id: '', key: 'file', label: 'Video', type: 'video' }],
      },
      settings: {},
    },
  },
  {
    type: 'videoIterator',
    label: 'Video Iterator',
    category: 'Video Utility',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [{ id: '', key: 'video_1', label: 'Input', type: 'video', required: false, dynamic: true, maxDynamic: 20, dynamicBase: 'video' }],
        outputs: [{ id: '', key: 'output', label: 'Output', type: 'video' }],
      },
      settings: {},
    },
  },
];

/** Auto-generated templates from the model registry */
const MODEL_TEMPLATES: NodeTemplate[] = MODEL_REGISTRY.map((model) => ({
  type: model.nodeType as FlowNodeType,
  label: model.title,
  category: model.category,
  defaultData: {
    behavior: 'dynamic' as const,
    handles: {
      inputs: model.inputs.map((h) => ({
        id: '',
        key: h.key,
        label: h.label,
        type: h.type,
        required: h.required,
        ...(h.dynamic ? { dynamic: true, maxDynamic: h.maxDynamic, dynamicBase: h.key.replace(/_\d+$/, '') } : {}),
      })),
      outputs: model.outputs.map((h) => ({
        id: '',
        key: h.key,
        label: h.label,
        type: h.type,
      })),
    },
    settings: getDefaultSettings(model),
  },
}));

export const NODE_TEMPLATES: NodeTemplate[] = [...STATIC_TEMPLATES, ...MODEL_TEMPLATES];
