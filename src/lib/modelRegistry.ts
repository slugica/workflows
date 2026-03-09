/**
 * Model Registry — defines available AI models and maps their fal.ai schemas
 * to flow node definitions (inputs, outputs, settings).
 *
 * All settings are verified against real fal.ai OpenAPI schemas (March 2026).
 */

import type { HandleDataType } from './types';

// ── Setting definitions (rendered in PropertiesPanel) ────────────────────────

export type SettingType = 'select' | 'number' | 'text' | 'toggle' | 'slider';

export interface SettingOption {
  label: string;
  value: string | number;
}

export interface SettingDef {
  key: string;
  label: string;
  type: SettingType;
  default: unknown;
  options?: SettingOption[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

// ── Model definition ─────────────────────────────────────────────────────────

export interface HandleMapping {
  key: string;
  label: string;
  type: HandleDataType;
  required?: boolean;
  falParam: string;
  /** If set, connecting this handle spawns a new one (up to maxDynamic) */
  dynamic?: boolean;
  maxDynamic?: number;
}

export interface ModelDef {
  id: string;
  title: string;
  category: 'Image Generation' | 'Image Editing' | 'Upscale' | 'Video Generation' | 'Video Editing' | 'Audio' | 'Utility';
  nodeType: 'image' | 'video' | 'audio' | 'textUtility';
  inputs: HandleMapping[];
  outputs: HandleMapping[];
  settings: SettingDef[];
}

// ── Shared option sets ───────────────────────────────────────────────────────

const FLUX_IMAGE_SIZES: SettingOption[] = [
  { label: 'Square HD', value: 'square_hd' },
  { label: 'Square', value: 'square' },
  { label: 'Portrait 4:3', value: 'portrait_4_3' },
  { label: 'Portrait 16:9', value: 'portrait_16_9' },
  { label: 'Landscape 4:3', value: 'landscape_4_3' },
  { label: 'Landscape 16:9', value: 'landscape_16_9' },
];

const NANO_BANANA_RATIOS: SettingOption[] = [
  { label: 'Auto', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '5:4', value: '5:4' },
  { label: '4:5', value: '4:5' },
  { label: '21:9', value: '21:9' },
];

const FORMAT_JPG_PNG: SettingOption[] = [
  { label: 'JPEG', value: 'jpeg' },
  { label: 'PNG', value: 'png' },
];

const FORMAT_JPG_PNG_WEBP: SettingOption[] = [
  { label: 'JPEG', value: 'jpeg' },
  { label: 'PNG', value: 'png' },
  { label: 'WebP', value: 'webp' },
];

const SAFETY_1_6: SettingOption[] = [
  { label: '1 (Strictest)', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6 (Least)', value: '6' },
];

const SAFETY_1_5: SettingOption[] = [
  { label: '1 (Strictest)', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
  { label: '5 (Least)', value: '5' },
];

// ── The registry ─────────────────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelDef[] = [

  // ━━━ Image Generation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'fal-ai/flux/schnell',
    title: 'FLUX.1 Schnell',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'landscape_4_3', options: FLUX_IMAGE_SIZES },
      { key: 'num_inference_steps', label: 'Steps', type: 'slider', default: 4, min: 1, max: 12, step: 1 },
      { key: 'guidance_scale', label: 'CFG Scale', type: 'slider', default: 3.5, min: 1, max: 20, step: 0.5 },
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'enable_safety_checker', label: 'Safety Checker', type: 'toggle', default: true },
    ],
  },

  {
    id: 'fal-ai/flux/dev',
    title: 'FLUX.1 Dev',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'landscape_4_3', options: FLUX_IMAGE_SIZES },
      { key: 'num_inference_steps', label: 'Steps', type: 'slider', default: 28, min: 1, max: 50, step: 1 },
      { key: 'guidance_scale', label: 'CFG Scale', type: 'slider', default: 3.5, min: 1, max: 20, step: 0.5 },
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'enable_safety_checker', label: 'Safety Checker', type: 'toggle', default: true },
    ],
  },

  {
    id: 'fal-ai/flux-2-pro',
    title: 'Flux 2 Pro',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'landscape_4_3', options: FLUX_IMAGE_SIZES },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '2', options: SAFETY_1_5 },
      { key: 'enable_safety_checker', label: 'Safety Checker', type: 'toggle', default: true },
    ],
  },

  {
    id: 'fal-ai/nano-banana-2',
    title: 'Nano Banana 2 (Gemini)',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
      { key: 'ref_1', label: 'Reference Image', type: 'image', required: false, falParam: 'image_urls', dynamic: true, maxDynamic: 4 },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '1:1', options: NANO_BANANA_RATIOS },
      { key: 'resolution', label: 'Resolution', type: 'select', default: '1K', options: [
        { label: '0.5K', value: '0.5K' },
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '4K', value: '4K' },
      ]},
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: FORMAT_JPG_PNG_WEBP },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '4', options: SAFETY_1_6 },
      { key: 'enable_web_search', label: 'Web Search', type: 'toggle', default: false, description: 'Ground generation with web search' },
    ],
  },

  {
    id: 'fal-ai/nano-banana-pro',
    title: 'Nano Banana Pro (Gemini)',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
      { key: 'ref_1', label: 'Reference Image', type: 'image', required: false, falParam: 'image_urls', dynamic: true, maxDynamic: 4 },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '1:1', options: NANO_BANANA_RATIOS },
      { key: 'resolution', label: 'Resolution', type: 'select', default: '1K', options: [
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '4K', value: '4K' },
      ]},
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: FORMAT_JPG_PNG_WEBP },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '4', options: SAFETY_1_6 },
      { key: 'enable_web_search', label: 'Web Search', type: 'toggle', default: false, description: 'Ground generation with web search' },
    ],
  },

  {
    id: 'fal-ai/gpt-image-1.5',
    title: 'GPT-Image 1.5',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: '1024x1024', options: [
        { label: '1024x1024 (1:1)', value: '1024x1024' },
        { label: '1536x1024 (3:2)', value: '1536x1024' },
        { label: '1024x1536 (2:3)', value: '1024x1536' },
      ]},
      { key: 'quality', label: 'Quality', type: 'select', default: 'high', options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ]},
      { key: 'background', label: 'Background', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Transparent', value: 'transparent' },
        { label: 'Opaque', value: 'opaque' },
      ]},
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: FORMAT_JPG_PNG_WEBP },
    ],
  },

  {
    id: 'fal-ai/flux-lora',
    title: 'FLUX.1 Dev + LoRA',
    category: 'Image Generation',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'landscape_4_3', options: FLUX_IMAGE_SIZES },
      { key: 'num_inference_steps', label: 'Steps', type: 'slider', default: 28, min: 1, max: 50, step: 1 },
      { key: 'guidance_scale', label: 'CFG Scale', type: 'slider', default: 3.5, min: 0, max: 35, step: 0.5 },
      { key: 'lora_path', label: 'LoRA Path/URL', type: 'text', default: '', description: 'URL or HuggingFace path to LoRA weights' },
      { key: 'lora_scale', label: 'LoRA Scale', type: 'slider', default: 1, min: 0, max: 4, step: 0.1 },
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'enable_safety_checker', label: 'Safety Checker', type: 'toggle', default: true },
    ],
  },

  // ━━━ Image Editing (image-to-image) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'fal-ai/nano-banana-2/edit',
    title: 'Nano Banana 2 Edit',
    category: 'Image Editing',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
      { key: 'ref_1', label: 'Input Image', type: 'image', required: true, falParam: 'image_urls', dynamic: true, maxDynamic: 4 },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: 'auto', options: NANO_BANANA_RATIOS },
      { key: 'resolution', label: 'Resolution', type: 'select', default: '1K', options: [
        { label: '0.5K', value: '0.5K' },
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '4K', value: '4K' },
      ]},
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: FORMAT_JPG_PNG_WEBP },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '4', options: SAFETY_1_6 },
    ],
  },

  {
    id: 'fal-ai/gpt-image-1.5/edit',
    title: 'GPT-Image 1.5 Edit',
    category: 'Image Editing',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
      { key: 'ref_1', label: 'Input Image', type: 'image', required: true, falParam: 'image_urls', dynamic: true, maxDynamic: 4 },
      { key: 'mask', label: 'Mask', type: 'image', required: false, falParam: 'mask_image_url' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' },
        { label: '1024x1024 (1:1)', value: '1024x1024' },
        { label: '1536x1024 (3:2)', value: '1536x1024' },
        { label: '1024x1536 (2:3)', value: '1024x1536' },
      ]},
      { key: 'quality', label: 'Quality', type: 'select', default: 'high', options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ]},
      { key: 'background', label: 'Background', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Transparent', value: 'transparent' },
        { label: 'Opaque', value: 'opaque' },
      ]},
      { key: 'input_fidelity', label: 'Input Fidelity', type: 'select', default: 'high', options: [
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ]},
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: FORMAT_JPG_PNG_WEBP },
    ],
  },

  {
    id: 'fal-ai/flux-pro/kontext',
    title: 'FLUX Kontext Pro',
    category: 'Image Editing',
    nodeType: 'image',
    inputs: [
      { key: 'imageUrl', label: 'Input Image', type: 'image', required: true, falParam: 'image_url' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '', options: [
        { label: 'Auto (from input)', value: '' },
        { label: '1:1', value: '1:1' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '3:2', value: '3:2' },
        { label: '2:3', value: '2:3' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '21:9', value: '21:9' },
        { label: '9:21', value: '9:21' },
      ]},
      { key: 'guidance_scale', label: 'CFG Scale', type: 'slider', default: 3.5, min: 1, max: 20, step: 0.5 },
      { key: 'num_images', label: 'Images', type: 'number', default: 1, min: 1, max: 4 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '2', options: SAFETY_1_6 },
      { key: 'enhance_prompt', label: 'Enhance Prompt', type: 'toggle', default: false, description: 'Auto-improve prompt' },
    ],
  },

  {
    id: 'fal-ai/flux-2-pro/edit',
    title: 'Flux 2 Pro Edit',
    category: 'Image Editing',
    nodeType: 'image',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
      { key: 'ref_1', label: 'Input Image', type: 'image', required: true, falParam: 'image_urls', dynamic: true, maxDynamic: 4 },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'images' },
    ],
    settings: [
      { key: 'image_size', label: 'Size', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' },
        ...FLUX_IMAGE_SIZES,
      ]},
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '2', options: SAFETY_1_5 },
      { key: 'enable_safety_checker', label: 'Safety Checker', type: 'toggle', default: true },
    ],
  },

  // ━━━ Upscale ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'fal-ai/topaz/upscale/image',
    title: 'Topaz Upscale',
    category: 'Upscale',
    nodeType: 'image',
    inputs: [
      { key: 'imageUrl', label: 'Input Image', type: 'image', required: true, falParam: 'image_url' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'image' },
    ],
    settings: [
      { key: 'model', label: 'Model', type: 'select', default: 'Standard V2', options: [
        { label: 'Low Resolution V2', value: 'Low Resolution V2' },
        { label: 'Standard V2', value: 'Standard V2' },
        { label: 'CGI', value: 'CGI' },
        { label: 'High Fidelity V2', value: 'High Fidelity V2' },
        { label: 'Text Refine', value: 'Text Refine' },
        { label: 'Recovery', value: 'Recovery' },
        { label: 'Redefine', value: 'Redefine' },
        { label: 'Recovery V2', value: 'Recovery V2' },
      ]},
      { key: 'upscale_factor', label: 'Scale', type: 'slider', default: 2, min: 1, max: 4, step: 0.5 },
      { key: 'subject_detection', label: 'Enhance Target', type: 'select', default: 'All', options: [
        { label: 'All', value: 'All' },
        { label: 'Foreground', value: 'Foreground' },
        { label: 'Background', value: 'Background' },
      ]},
      { key: 'face_enhancement', label: 'Face Enhance', type: 'toggle', default: true },
      { key: 'face_enhancement_strength', label: 'Face Strength', type: 'slider', default: 0.8, min: 0, max: 1, step: 0.1 },
      { key: 'face_enhancement_creativity', label: 'Face Creativity', type: 'slider', default: 0, min: 0, max: 1, step: 0.1 },
      { key: 'crop_to_fill', label: 'Crop to Fill', type: 'toggle', default: false },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpeg', options: FORMAT_JPG_PNG },
    ],
  },

  {
    id: 'fal-ai/seedvr/upscale/image',
    title: 'SeedVR2 Upscale',
    category: 'Upscale',
    nodeType: 'image',
    inputs: [
      { key: 'imageUrl', label: 'Input Image', type: 'image', required: true, falParam: 'image_url' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'image' },
    ],
    settings: [
      { key: 'upscale_mode', label: 'Mode', type: 'select', default: 'factor', options: [
        { label: 'By Factor', value: 'factor' },
        { label: 'To Resolution', value: 'target' },
      ]},
      { key: 'upscale_factor', label: 'Scale Factor', type: 'slider', default: 2, min: 1, max: 10, step: 0.5 },
      { key: 'target_resolution', label: 'Target Resolution', type: 'select', default: '1080p', options: [
        { label: '720p', value: '720p' },
        { label: '1080p', value: '1080p' },
        { label: '1440p', value: '1440p' },
        { label: '2160p (4K)', value: '2160p' },
      ]},
      { key: 'noise_scale', label: 'Noise Scale', type: 'slider', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'output_format', label: 'Format', type: 'select', default: 'jpg', options: [
        { label: 'PNG', value: 'png' },
        { label: 'JPG', value: 'jpg' },
        { label: 'WebP', value: 'webp' },
      ]},
    ],
  },

  // ━━━ Utility ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'fal-ai/bria/background/remove',
    title: 'Bria BG Remove',
    category: 'Utility',
    nodeType: 'image',
    inputs: [
      { key: 'imageUrl', label: 'Input Image', type: 'image', required: true, falParam: 'image_url' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'image' },
    ],
    settings: [],
  },

  {
    id: 'fal-ai/birefnet/v2',
    title: 'BiRefNet BG Remove',
    category: 'Utility',
    nodeType: 'image',
    inputs: [
      { key: 'imageUrl', label: 'Input Image', type: 'image', required: true, falParam: 'image_url' },
    ],
    outputs: [
      { key: 'image', label: 'Image', type: 'image', falParam: 'image' },
    ],
    settings: [
      { key: 'model', label: 'Model', type: 'select', default: 'General Use (Light)', options: [
        { label: 'General (Light)', value: 'General Use (Light)' },
        { label: 'Light 2K', value: 'Light 2K' },
        { label: 'Heavy', value: 'Heavy' },
        { label: 'Matting', value: 'Matting' },
        { label: 'Portrait', value: 'Portrait' },
        { label: 'Dynamic', value: 'Dynamic' },
      ]},
      { key: 'operating_resolution', label: 'Resolution', type: 'select', default: '1024x1024', options: [
        { label: '1024x1024', value: '1024x1024' },
        { label: '2048x2048', value: '2048x2048' },
        { label: '2304x2304', value: '2304x2304' },
      ]},
      { key: 'output_format', label: 'Format', type: 'select', default: 'png', options: [
        { label: 'PNG', value: 'png' },
        { label: 'WebP', value: 'webp' },
        { label: 'GIF', value: 'gif' },
      ]},
      { key: 'refine_foreground', label: 'Refine Foreground', type: 'toggle', default: true },
      { key: 'output_mask', label: 'Output Mask', type: 'toggle', default: false },
    ],
  },

  // ━━━ Video Generation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    title: 'Kling v3 Pro',
    category: 'Video Generation',
    nodeType: 'video',
    inputs: [
      { key: 'imageUrl', label: 'Start Frame', type: 'image', required: true, falParam: 'start_image_url' },
      { key: 'endImageUrl', label: 'End Frame', type: 'image', required: false, falParam: 'end_image_url' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: false, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'video', label: 'Video', type: 'video', falParam: 'video' },
    ],
    settings: [
      { key: 'duration', label: 'Duration (s)', type: 'select', default: '5', options: [
        { label: '3s', value: '3' }, { label: '5s', value: '5' }, { label: '8s', value: '8' },
        { label: '10s', value: '10' }, { label: '12s', value: '12' }, { label: '15s', value: '15' },
      ]},
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '16:9', options: [
        { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '1:1', value: '1:1' },
      ]},
      { key: 'cfg_scale', label: 'CFG Scale', type: 'slider', default: 0.5, min: 0, max: 1, step: 0.1 },
      { key: 'generate_audio', label: 'Generate Audio', type: 'toggle', default: true },
      { key: 'negative_prompt', label: 'Negative Prompt', type: 'text', default: 'blur, distort, and low quality' },
    ],
  },

  {
    id: 'fal-ai/kling-video/v3/standard/image-to-video',
    title: 'Kling v3 Standard',
    category: 'Video Generation',
    nodeType: 'video',
    inputs: [
      { key: 'imageUrl', label: 'Start Frame', type: 'image', required: true, falParam: 'start_image_url' },
      { key: 'endImageUrl', label: 'End Frame', type: 'image', required: false, falParam: 'end_image_url' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: false, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'video', label: 'Video', type: 'video', falParam: 'video' },
    ],
    settings: [
      { key: 'duration', label: 'Duration (s)', type: 'select', default: '5', options: [
        { label: '3s', value: '3' }, { label: '5s', value: '5' }, { label: '8s', value: '8' },
        { label: '10s', value: '10' }, { label: '12s', value: '12' }, { label: '15s', value: '15' },
      ]},
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '16:9', options: [
        { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '1:1', value: '1:1' },
      ]},
      { key: 'cfg_scale', label: 'CFG Scale', type: 'slider', default: 0.5, min: 0, max: 1, step: 0.1 },
      { key: 'generate_audio', label: 'Generate Audio', type: 'toggle', default: true },
      { key: 'negative_prompt', label: 'Negative Prompt', type: 'text', default: 'blur, distort, and low quality' },
    ],
  },

  {
    id: 'fal-ai/veo3.1/image-to-video',
    title: 'Veo 3.1 (Google)',
    category: 'Video Generation',
    nodeType: 'video',
    inputs: [
      { key: 'imageUrl', label: 'Start Frame', type: 'image', required: true, falParam: 'image_url' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'video', label: 'Video', type: 'video', falParam: 'video' },
    ],
    settings: [
      { key: 'duration', label: 'Duration', type: 'select', default: '8s', options: [
        { label: '4s', value: '4s' }, { label: '6s', value: '6s' }, { label: '8s', value: '8s' },
      ]},
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
      ]},
      { key: 'resolution', label: 'Resolution', type: 'select', default: '720p', options: [
        { label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }, { label: '4K', value: '4k' },
      ]},
      { key: 'generate_audio', label: 'Generate Audio', type: 'toggle', default: true },
      { key: 'negative_prompt', label: 'Negative Prompt', type: 'text', default: '' },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Random if empty' },
      { key: 'safety_tolerance', label: 'Safety', type: 'select', default: '4', options: SAFETY_1_6 },
    ],
  },

  {
    id: 'fal-ai/sora-2/text-to-video',
    title: 'Sora 2 (OpenAI)',
    category: 'Video Generation',
    nodeType: 'video',
    inputs: [
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'video', label: 'Video', type: 'video', falParam: 'video' },
    ],
    settings: [
      { key: 'duration', label: 'Duration (s)', type: 'select', default: 4, options: [
        { label: '4s', value: 4 }, { label: '8s', value: 8 }, { label: '12s', value: 12 },
      ]},
      { key: 'resolution', label: 'Resolution', type: 'select', default: '720p', options: [
        { label: '720p', value: '720p' }, { label: '1080p', value: '1080p' },
      ]},
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: '16:9', options: [
        { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
      ]},
      { key: 'model', label: 'Model Version', type: 'select', default: 'sora-2', options: [
        { label: 'Sora 2 (latest)', value: 'sora-2' },
        { label: 'Sora 2 (2025-12-08)', value: 'sora-2-2025-12-08' },
        { label: 'Sora 2 (2025-10-06)', value: 'sora-2-2025-10-06' },
      ]},
    ],
  },

  {
    id: 'fal-ai/sora-2/image-to-video',
    title: 'Sora 2 Image-to-Video',
    category: 'Video Generation',
    nodeType: 'video',
    inputs: [
      { key: 'imageUrl', label: 'Start Frame', type: 'image', required: true, falParam: 'image_url' },
      { key: 'prompt', label: 'Prompt', type: 'text', required: true, falParam: 'prompt' },
    ],
    outputs: [
      { key: 'video', label: 'Video', type: 'video', falParam: 'video' },
    ],
    settings: [
      { key: 'duration', label: 'Duration (s)', type: 'select', default: 4, options: [
        { label: '4s', value: 4 }, { label: '8s', value: 8 }, { label: '12s', value: 12 },
      ]},
      { key: 'resolution', label: 'Resolution', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' }, { label: '720p', value: '720p' },
      ]},
      { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', default: 'auto', options: [
        { label: 'Auto', value: 'auto' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
      ]},
      { key: 'model', label: 'Model Version', type: 'select', default: 'sora-2', options: [
        { label: 'Sora 2 (latest)', value: 'sora-2' },
        { label: 'Sora 2 (2025-12-08)', value: 'sora-2-2025-12-08' },
        { label: 'Sora 2 (2025-10-06)', value: 'sora-2-2025-10-06' },
      ]},
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCategories(): string[] {
  return [...new Set(MODEL_REGISTRY.map((m) => m.category))];
}

export function getModelsByCategory(category: string): ModelDef[] {
  return MODEL_REGISTRY.filter((m) => m.category === category);
}

export function getModelById(id: string): ModelDef | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function getDefaultSettings(model: ModelDef): Record<string, unknown> {
  const settings: Record<string, unknown> = { modelId: model.id };
  for (const s of model.settings) {
    settings[s.key] = s.default;
  }
  return settings;
}
