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
  file: '#FCB84A',
};

import { MODEL_REGISTRY, getDefaultSettings } from './modelRegistry';

/** Static (non-model) templates */
const STATIC_TEMPLATES: NodeTemplate[] = [
  {
    type: 'import',
    label: 'Upload',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: { allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'] },
    },
  },
  {
    type: 'import',
    label: 'Image',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: { allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
    },
  },
  {
    type: 'import',
    label: 'Video',
    category: 'Essentials',
    defaultData: {
      behavior: 'static',
      handles: {
        inputs: [],
        outputs: [{ id: '', key: 'file', label: 'File', type: 'file' }],
      },
      settings: { allowedFileTypes: ['video/mp4', 'video/webm', 'video/mov'] },
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
        outputs: [{ id: '', key: 'frame', label: 'Frame', type: 'image' }],
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
