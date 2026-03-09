export type HandleDataType = 'image' | 'text' | 'video' | 'audio';

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

export type FlowNodeType = 'import' | 'prompt' | 'image' | 'video' | 'audio' | 'textUtility';

export interface NodeTemplate {
  type: FlowNodeType;
  label: string;
  category: string;
  defaultData: Partial<FlowNodeData>;
}

export const HANDLE_COLORS: Record<HandleDataType, string> = {
  image: '#8b5cf6',
  text: '#3b82f6',
  video: '#ef4444',
  audio: '#f59e0b',
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
        outputs: [{ id: '', key: 'file', label: 'File', type: 'image' }],
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
        outputs: [{ id: '', key: 'file', label: 'Image', type: 'image' }],
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
        outputs: [{ id: '', key: 'file', label: 'Video', type: 'video' }],
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
    type: 'textUtility',
    label: 'AI Copilot',
    category: 'Text',
    defaultData: {
      behavior: 'dynamic',
      handles: {
        inputs: [{ id: '', key: 'prompt', label: 'Input', type: 'text', required: true }],
        outputs: [{ id: '', key: 'prompt', label: 'Output', type: 'text' }],
      },
      settings: { systemPrompt: 'You are a creative assistant.' },
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
