/**
 * Execution engine — collects inputs from connected nodes,
 * builds the API request body, and calls the appropriate provider.
 */

import { Node, Edge } from '@xyflow/react';
import { FlowNodeData, HandleDef } from './types';
import { getModelById, ModelDef, HandleMapping } from './modelRegistry';

// ── Collect inputs from the graph ───────────────────────────────────────────

interface CollectedInputs {
  [falParam: string]: unknown;
}

function getNodeData(node: Node): FlowNodeData {
  return node.data as unknown as FlowNodeData;
}

/**
 * Given a target node, walk its incoming edges to collect input values.
 * Returns a map of falParam → value, ready for the API.
 */
function collectInputs(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  model: ModelDef
): CollectedInputs {
  const inputs: CollectedInputs = {};
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return inputs;

  const data = getNodeData(node);
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  for (const edge of incomingEdges) {
    const targetHandleId = edge.targetHandle;
    if (!targetHandleId) continue;

    // Find which handle def this edge connects to
    const handleDef = data.handles.inputs.find((h: HandleDef) => h.id === targetHandleId);
    if (!handleDef) continue;

    // Find the model input mapping for this handle
    // For dynamic handles (ref_1, ref_2...), match by dynamicBase or key prefix
    const baseKey = handleDef.dynamicBase || handleDef.key;
    const modelInput = model.inputs.find(
      (mi: HandleMapping) => mi.key === handleDef.key || mi.key === baseKey || mi.key.replace(/_\d+$/, '') === baseKey
    );
    if (!modelInput) continue;

    // Get value from the source node
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;

    const sourceData = getNodeData(sourceNode);
    const value = resolveOutputValue(sourceData, edge.sourceHandle);
    if (value === undefined || value === null) continue;

    const falParam = modelInput.falParam;

    // Some params aggregate multiple inputs (e.g. image_urls is an array)
    if (modelInput.dynamic) {
      // Aggregate into array
      if (!Array.isArray(inputs[falParam])) {
        inputs[falParam] = [];
      }
      (inputs[falParam] as unknown[]).push(value);
    } else {
      inputs[falParam] = value;
    }
  }

  return inputs;
}

/**
 * Resolve what value a source node's output handle provides.
 * - Prompt nodes → text string from settings.promptText
 * - Import nodes → file URL from settings.fileUrl
 * - AI nodes → result URL from previous generation
 */
function resolveOutputValue(sourceData: FlowNodeData, sourceHandleId: string | null | undefined): unknown {
  if (!sourceHandleId) return undefined;

  // Parse handle: {nodeId}|output:{type}:{key}
  const parts = sourceHandleId.split('|');
  if (parts.length !== 2) return undefined;
  const segments = parts[1].split(':');
  if (segments.length !== 3) return undefined;
  const [, handleType, handleKey] = segments;

  // Prompt node → text
  if (handleType === 'text' && handleKey === 'prompt') {
    return sourceData.settings.promptText as string || '';
  }

  // Import/upload node → file URL
  if (handleKey === 'file' && sourceData.settings.fileUrl) {
    return sourceData.settings.fileUrl as string;
  }

  // AI node results → look for image/video URL in results
  if (sourceData.results && sourceData.results.length > 0) {
    const result = sourceData.results[sourceData.selectedResultIndex || 0];
    if (result) {
      // Try to find matching output by key
      if (result[handleKey]) {
        return result[handleKey].content;
      }
      // Try by type
      if (handleType === 'image' && result.image) {
        return result.image.content;
      }
      if (handleType === 'video' && result.video) {
        return result.video.content;
      }
    }
  }

  return undefined;
}

// ── Build fal.ai request body ───────────────────────────────────────────────

function buildFalInput(
  collectedInputs: CollectedInputs,
  settings: Record<string, unknown>,
  model: ModelDef
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  // Add collected inputs (prompt, images, etc.)
  for (const [param, value] of Object.entries(collectedInputs)) {
    body[param] = value;
  }

  // Add settings (skip internal keys)
  const skipKeys = new Set(['modelId', 'fileName', 'fileUrl', 'fileType', 'allowedFileTypes']);
  for (const settingDef of model.settings) {
    const value = settings[settingDef.key];
    if (value === null || value === undefined || value === '') continue;
    if (skipKeys.has(settingDef.key)) continue;

    // For LoRA, format as array
    if (settingDef.key === 'lora_path' && value) {
      const scale = settings.lora_scale ?? 1;
      body.loras = [{ path: value, scale }];
      continue;
    }
    if (settingDef.key === 'lora_scale') continue; // handled above

    body[settingDef.key] = value;
  }

  return body;
}

// ── Parse fal.ai response ───────────────────────────────────────────────────

interface ExecutionResult {
  success: boolean;
  results?: FlowNodeData['results'];
  error?: string;
}

function parseFalResult(result: Record<string, unknown>, model: ModelDef): FlowNodeData['results'] {
  const parsed: FlowNodeData['results'] = [];

  // Most image models return { images: [{ url, ... }] }
  // Some return { image: { url, ... } }
  // Video models return { video: { url, ... } }

  for (const output of model.outputs) {
    const falParam = output.falParam;
    const data = result[falParam];

    if (!data) continue;

    if (Array.isArray(data)) {
      // Multiple results (e.g. images array)
      for (const item of data) {
        const url = (item as Record<string, unknown>).url as string;
        if (url) {
          parsed.push({
            [output.key]: {
              content: url,
              format: output.type,
            },
          });
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      // Single result (e.g. video object or single image)
      const url = (data as Record<string, unknown>).url as string;
      if (url) {
        parsed.push({
          [output.key]: {
            content: url,
            format: output.type,
          },
        });
      }
    }
  }

  return parsed;
}

// ── Main execute function ───────────────────────────────────────────────────

export async function executeNode(
  nodeId: string,
  nodes: Node[],
  edges: Edge[]
): Promise<ExecutionResult> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { success: false, error: 'Node not found' };

  const data = getNodeData(node);
  const modelId = data.settings.modelId as string;
  if (!modelId) return { success: false, error: 'No model assigned to this node' };

  const model = getModelById(modelId);
  if (!model) return { success: false, error: `Unknown model: ${modelId}` };

  // Collect inputs from connected nodes
  const collectedInputs = collectInputs(nodeId, nodes, edges, model);

  // Validate required inputs
  for (const input of model.inputs) {
    if (input.required && !(input.falParam in collectedInputs)) {
      return { success: false, error: `Missing required input: ${input.label}` };
    }
  }

  // Build request
  const falInput = buildFalInput(collectedInputs, data.settings, model);

  // Call our API route
  try {
    const res = await fetch('/api/fal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, input: falInput }),
    });

    const json = await res.json();

    if (!res.ok || json.error) {
      return { success: false, error: json.error || `HTTP ${res.status}` };
    }

    const results = parseFalResult(json.result, model);
    if (results.length === 0) {
      return { success: false, error: 'No output returned from model' };
    }

    return { success: true, results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
