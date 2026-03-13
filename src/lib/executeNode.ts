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

  // Import/upload node → use remote URL (uploaded to fal.ai storage)
  if (handleKey === 'file') {
    // Prefer remoteUrl (fal.ai storage) over local blob URL
    if (sourceData.settings.remoteUrl) {
      return sourceData.settings.remoteUrl as string;
    }
    // Fallback to local URL (won't work for fal.ai but might for other providers)
    if (sourceData.settings.fileUrl) {
      return sourceData.settings.fileUrl as string;
    }
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

// ── Upload blob URLs to fal.ai storage ──────────────────────────────────────

export async function uploadBlobToFal(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  const formData = new FormData();
  formData.append('file', new File([blob], 'input.png', { type: blob.type || 'image/png' }));
  const uploadRes = await fetch('/api/fal/upload', { method: 'POST', body: formData });
  const json = await uploadRes.json();
  if (!json.url) throw new Error(`Failed to upload blob: ${json.error || 'no URL returned'}`);
  return json.url;
}

/** Ensure a URL is remote (upload blob URLs to fal.ai storage) */
export async function ensureRemoteUrl(url: string): Promise<string> {
  return url.startsWith('blob:') ? uploadBlobToFal(url) : url;
}

/** Replace any blob: URLs in collected inputs with remote fal.ai URLs */
async function ensureRemoteUrls(inputs: CollectedInputs): Promise<CollectedInputs> {
  const result: CollectedInputs = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string' && value.startsWith('blob:')) {
      result[key] = await uploadBlobToFal(value);
    } else if (Array.isArray(value)) {
      result[key] = await Promise.all(
        value.map((v) => typeof v === 'string' && v.startsWith('blob:') ? uploadBlobToFal(v) : v)
      );
    } else {
      result[key] = value;
    }
  }
  return result;
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

// ── Rendi (FFmpeg) execution for utility nodes ─────────────────────────────

export async function executeRendi(body: {
  input_files: Record<string, string>;
  output_files: Record<string, string>;
  ffmpeg_command: string;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  const res = await fetch('/api/rendi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    return { success: false, error: json.error || `HTTP ${res.status}` };
  }
  // Get the first output file URL
  const outputs = json.output_files;
  if (outputs) {
    const firstKey = Object.keys(outputs)[0];
    if (firstKey && outputs[firstKey]?.storage_url) {
      return { success: true, url: outputs[firstKey].storage_url };
    }
  }
  return { success: false, error: 'No output file returned from Rendi' };
}

function getSourceVideoUrl(nodeId: string, nodes: Node[], edges: Edge[]): string | null {
  const inEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle &&
      (e.targetHandle.includes('input:video') || e.targetHandle.includes('input:file'))
  );
  if (!inEdge) return null;
  const sourceNode = nodes.find((n) => n.id === inEdge.source);
  if (!sourceNode) return null;
  const sourceData = getNodeData(sourceNode);
  // Check results first (e.g. from CropNode or other processing nodes)
  if (sourceData.results?.length) {
    const result = sourceData.results[sourceData.selectedResultIndex || 0];
    if (result) {
      const entry = result.file || result.video;
      if (entry?.content) return entry.content as string;
    }
  }
  // Fallback to import node URLs
  return (sourceData.settings.remoteUrl || sourceData.settings.fileUrl) as string || null;
}

async function executeCropNode(nodeId: string, nodes: Node[], edges: Edge[]): Promise<ExecutionResult> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { success: false, error: 'Node not found' };
  const data = getNodeData(node);

  const videoUrl = getSourceVideoUrl(nodeId, nodes, edges);
  if (!videoUrl) return { success: false, error: 'No video input connected' };

  // Get crop data from results (set by CropNode UI)
  const result = data.results?.[0];
  const cropEntry = result?.file;
  if (!cropEntry?.cropW || !cropEntry?.cropH) {
    return { success: false, error: 'No crop selection — adjust the crop area first' };
  }

  const { cropX, cropY, cropW, cropH } = cropEntry as unknown as { cropX: number; cropY: number; cropW: number; cropH: number };

  const rendiResult = await executeRendi({
    input_files: { in_video: videoUrl },
    output_files: { out_video: 'cropped.mp4' },
    ffmpeg_command: `-i {{in_video}} -vf "crop=${cropW}:${cropH}:${cropX}:${cropY}" -c:a copy {{out_video}}`,
  });

  if (!rendiResult.success) return { success: false, error: rendiResult.error };
  return {
    success: true,
    results: [{ file: { content: rendiResult.url!, format: 'video', cropX, cropY, cropW, cropH, naturalW: cropW, naturalH: cropH } }],
  };
}

async function executeTrimNode(nodeId: string, nodes: Node[], edges: Edge[]): Promise<ExecutionResult> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { success: false, error: 'Node not found' };
  const data = getNodeData(node);

  const videoUrl = getSourceVideoUrl(nodeId, nodes, edges);
  if (!videoUrl) return { success: false, error: 'No video input connected' };

  const segments = data.settings.segments as { start: number; end: number }[] | undefined;
  if (!segments || segments.length === 0) {
    return { success: false, error: 'No trim segments defined' };
  }

  if (segments.length === 1) {
    // Simple trim — single segment
    const { start, end } = segments[0];
    const rendiResult = await executeRendi({
      input_files: { in_video: videoUrl },
      output_files: { out_video: 'trimmed.mp4' },
      ffmpeg_command: `-i {{in_video}} -ss ${start.toFixed(3)} -to ${end.toFixed(3)} -c:v libx264 -c:a aac {{out_video}}`,
    });
    if (!rendiResult.success) return { success: false, error: rendiResult.error };
    return {
      success: true,
      results: [{ video: { content: rendiResult.url!, format: 'video' } }],
    };
  }

  // Multiple segments — build complex filter to concat
  // Try with audio first, fallback to video-only if it fails (no audio stream)
  const segs = segments; // narrowed: segments is defined and length > 1 here
  function buildMultiSegmentFilter(withAudio: boolean) {
    const parts: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const { start, end } = segs[i];
      parts.push(`[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
      if (withAudio) {
        parts.push(`[0:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
      }
    }
    const inputs = segs.map((_, i) => withAudio ? `[v${i}][a${i}]` : `[v${i}]`).join('');
    parts.push(`${inputs}concat=n=${segs.length}:v=1:a=${withAudio ? 1 : 0}${withAudio ? '[outv][outa]' : '[outv]'}`);
    return parts.join(';');
  }

  // Try with audio
  let rendiResult = await executeRendi({
    input_files: { in_video: videoUrl },
    output_files: { out_video: 'trimmed.mp4' },
    ffmpeg_command: `-i {{in_video}} -filter_complex "${buildMultiSegmentFilter(true)}" -map "[outv]" -map "[outa]" {{out_video}}`,
  });

  // Fallback: retry without audio
  if (!rendiResult.success) {
    rendiResult = await executeRendi({
      input_files: { in_video: videoUrl },
      output_files: { out_video: 'trimmed.mp4' },
      ffmpeg_command: `-i {{in_video}} -filter_complex "${buildMultiSegmentFilter(false)}" -map "[outv]" -an {{out_video}}`,
    });
  }

  if (!rendiResult.success) return { success: false, error: rendiResult.error };
  return {
    success: true,
    results: [{ video: { content: rendiResult.url!, format: 'video' } }],
  };
}

// ── Combine Video node: concatenate multiple videos with optional transitions ─

async function executeCombineVideoNode(nodeId: string, nodes: Node[], edges: Edge[]): Promise<ExecutionResult> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { success: false, error: 'Node not found' };
  const data = getNodeData(node);

  // Collect all incoming video edges sorted by handle key
  const incomingEdges = edges
    .filter(e => e.target === nodeId && e.targetHandle?.includes('input:video'))
    .sort((a, b) => {
      const keyA = parseInt((a.targetHandle?.split(':').pop() || '').replace(/\D/g, '')) || 0;
      const keyB = parseInt((b.targetHandle?.split(':').pop() || '').replace(/\D/g, '')) || 0;
      return keyA - keyB;
    });

  if (incomingEdges.length < 2) {
    return { success: false, error: 'Connect at least 2 videos' };
  }

  // Resolve video URLs from source nodes
  const videoUrls: string[] = [];
  for (const edge of incomingEdges) {
    const srcNode = nodes.find(n => n.id === edge.source);
    if (!srcNode) continue;
    const srcData = getNodeData(srcNode);

    let url: string | null = null;
    if (srcData.settings.fileUrl) {
      url = srcData.settings.fileUrl as string;
    } else if (srcData.results?.length) {
      const r = srcData.results[srcData.selectedResultIndex || 0];
      if (r) {
        const handleKey = edge.sourceHandle?.split(':').pop();
        if (handleKey && r[handleKey]?.content) {
          url = r[handleKey].content;
        } else {
          const entry = Object.values(r)[0];
          if (entry?.content) url = entry.content;
        }
      }
    }
    if (url) videoUrls.push(await ensureRemoteUrl(url));
  }

  if (videoUrls.length < 2) {
    return { success: false, error: 'Could not resolve at least 2 video URLs' };
  }

  const n = videoUrls.length;
  const transition = (data.settings.transition as string) || 'none';

  // Build input_files
  const input_files: Record<string, string> = {};
  for (let i = 0; i < n; i++) input_files[`in_${i}`] = videoUrls[i];

  const inputArgs = Array.from({ length: n }, (_, i) => `-i {{in_${i}}}`).join(' ');

  // For simple concat (no transition), audio fallback pattern
  if (transition === 'none') {
    const streams = Array.from({ length: n }, (_, i) => `[${i}:v][${i}:a]`).join('');
    let result = await executeRendi({
      input_files,
      output_files: { out_video: 'combined.mp4' },
      ffmpeg_command: `${inputArgs} -filter_complex "${streams}concat=n=${n}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" {{out_video}}`,
    });
    if (!result.success) {
      const vStreams = Array.from({ length: n }, (_, i) => `[${i}:v]`).join('');
      result = await executeRendi({
        input_files,
        output_files: { out_video: 'combined.mp4' },
        ffmpeg_command: `${inputArgs} -filter_complex "${vStreams}concat=n=${n}:v=1:a=0[outv]" -map "[outv]" -an {{out_video}}`,
      });
    }
    if (!result.success) return { success: false, error: result.error };
    return { success: true, results: [{ file: { content: result.url!, format: 'video' } }] };
  }

  // Xfade transitions — we don't know durations server-side, so use ffprobe-based approach
  // Build filter assuming Rendi can chain xfade. Offsets are unknown without probing.
  // Use a simpler concat-with-xfade by passing the command and letting Rendi handle it.
  // Since we can't probe durations here, we pass a reasonable default offset pattern.
  // The component-side execution (Run button) handles this better with client-side duration probing.
  return { success: false, error: 'Transition effects require using the Run button on the node (duration probing needed)' };
}

// ── Export node: walk chain, collect operations, execute via Rendi ───────────

/**
 * Universal FFmpeg operation descriptor.
 * Each processing node saves this to settings.ffmpegOp so the export chain
 * can collect operations without knowing about specific node types.
 */
interface FfmpegOp {
  vFilters?: string[];
  trim?: { segments: { start: number; end: number }[] };
}

/**
 * Walk backwards from a node through the chain of connected nodes.
 * Collects ffmpegOp from each node's settings — no type-specific logic.
 *
 * - Has settings.ffmpegOp → collect it, keep walking
 * - Has settings.fileUrl (import) → source node, stop
 * - Has results but no ffmpegOp → processed source (combineVideo, AI, etc.), stop
 * - Nothing → transparent pass-through, keep walking
 */
function walkChain(nodeId: string, nodes: Node[], edges: Edge[]): { sourceUrl: string | null; ops: FfmpegOp[] } {
  const ops: FfmpegOp[] = [];
  let currentId = nodeId;

  for (let depth = 0; depth < 20; depth++) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    const data = getNodeData(node);

    // Skip the export node itself
    if (node.type === 'export') {
      // just walk upstream
    } else if (data.settings.ffmpegOp) {
      // Node declares its FFmpeg contribution
      ops.unshift(data.settings.ffmpegOp as FfmpegOp);
    } else if (data.settings.fileUrl) {
      // Import/upload node — source
      const url = (data.settings.remoteUrl || data.settings.fileUrl) as string;
      return { sourceUrl: url || null, ops };
    } else if (data.results?.length) {
      // Node has a processed result but no ffmpegOp — use result as source
      const result = data.results[data.selectedResultIndex || 0];
      if (result) {
        const entry = Object.values(result)[0];
        if (entry?.content) {
          return { sourceUrl: entry.content, ops };
        }
      }
    }

    // Walk to the upstream node
    const inEdge = edges.find(
      (e) => e.target === currentId && e.targetHandle &&
        (e.targetHandle.includes('input:video') || e.targetHandle.includes('input:file'))
    );
    if (!inEdge) break;
    currentId = inEdge.source;
  }

  return { sourceUrl: null, ops };
}

/**
 * Build ffmpeg command pieces from collected FfmpegOps.
 * Merges all vFilters, handles trim (single segment as -ss/-to, multi as complex filter).
 */
function buildFfmpegFromOps(ops: FfmpegOp[], withAudio: boolean): { vFilters: string[]; trimArgs: { ss?: string; to?: string } | null; complexFilter: string | null } {
  const vFilters: string[] = [];
  let trimArgs: { ss?: string; to?: string } | null = null;
  let complexFilter: string | null = null;

  // First pass: collect all vFilters and find trim
  let trimOp: FfmpegOp['trim'] | null = null;
  for (const op of ops) {
    if (op.vFilters?.length) {
      vFilters.push(...op.vFilters);
    }
    if (op.trim?.segments?.length) {
      trimOp = op.trim;
    }
  }

  // Handle trim
  if (trimOp) {
    if (trimOp.segments.length === 1) {
      trimArgs = {
        ss: trimOp.segments[0].start.toFixed(3),
        to: trimOp.segments[0].end.toFixed(3),
      };
    } else {
      // Multi-segment: need filter_complex with concat
      const parts: string[] = [];
      const extraVf = vFilters.length > 0 ? ',' + vFilters.join(',') : '';
      for (let i = 0; i < trimOp.segments.length; i++) {
        const { start, end } = trimOp.segments[i];
        parts.push(`[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS${extraVf}[v${i}]`);
        if (withAudio) {
          parts.push(`[0:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
        }
      }
      const concatInputs = trimOp.segments.map((_, i) => withAudio ? `[v${i}][a${i}]` : `[v${i}]`).join('');
      parts.push(`${concatInputs}concat=n=${trimOp.segments.length}:v=1:a=${withAudio ? 1 : 0}${withAudio ? '[outv][outa]' : '[outv]'}`);
      complexFilter = parts.join(';');
      // vFilters already included in complex filter segments
      vFilters.length = 0;
    }
  }

  return { vFilters, trimArgs, complexFilter };
}

export async function executeExportNode(
  nodeId: string,
  nodes: Node[],
  edges: Edge[]
): Promise<ExecutionResult> {
  const { sourceUrl, ops } = walkChain(nodeId, nodes, edges);
  if (!sourceUrl) return { success: false, error: 'No video source found in chain' };

  // No operations — just pass through the source URL
  if (ops.length === 0) {
    return {
      success: true,
      results: [{ file: { content: sourceUrl, format: 'video' } }],
    };
  }

  function buildCommand(withAudio: boolean): string {
    const { vFilters: vf, trimArgs: ta, complexFilter: cf } = buildFfmpegFromOps(ops, withAudio);

    if (cf) {
      const mapArgs = withAudio ? '-map "[outv]" -map "[outa]"' : '-map "[outv]" -an';
      return `-i {{in_video}} -filter_complex "${cf}" ${mapArgs} {{out_video}}`;
    }

    const parts: string[] = [];
    if (ta?.ss) parts.push(`-ss ${ta.ss}`);
    if (ta?.to) parts.push(`-to ${ta.to}`);
    parts.push('-i {{in_video}}');
    if (vf.length > 0) parts.push(`-vf "${vf.join(',')}"`);
    parts.push('-c:a copy {{out_video}}');
    return parts.join(' ');
  }

  // Try with audio first, fallback to video-only
  let rendiResult = await executeRendi({
    input_files: { in_video: sourceUrl },
    output_files: { out_video: 'export.mp4' },
    ffmpeg_command: buildCommand(true),
  });

  if (!rendiResult.success) {
    rendiResult = await executeRendi({
      input_files: { in_video: sourceUrl },
      output_files: { out_video: 'export.mp4' },
      ffmpeg_command: buildCommand(false),
    });
  }

  if (!rendiResult.success) return { success: false, error: rendiResult.error };
  return {
    success: true,
    results: [{ file: { content: rendiResult.url!, format: 'video' } }],
  };
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

  // Route utility nodes to Rendi (FFmpeg)
  if (node.type === 'crop') return executeCropNode(nodeId, nodes, edges);
  if (node.type === 'trimVideo') return executeTrimNode(nodeId, nodes, edges);
  if (node.type === 'combineVideo') return executeCombineVideoNode(nodeId, nodes, edges);
  if (node.type === 'export') return executeExportNode(nodeId, nodes, edges);

  const modelId = data.settings.modelId as string;
  if (!modelId) return { success: false, error: 'No model assigned to this node' };

  const model = getModelById(modelId);
  if (!model) return { success: false, error: `Unknown model: ${modelId}` };

  // Collect inputs from connected nodes
  const rawInputs = collectInputs(nodeId, nodes, edges, model);

  // Validate required inputs
  for (const input of model.inputs) {
    if (input.required && !(input.falParam in rawInputs)) {
      return { success: false, error: `Missing required input: ${input.label}` };
    }
  }

  // Upload any local blob URLs to fal.ai storage
  const collectedInputs = await ensureRemoteUrls(rawInputs);

  // Build request
  const falInput = buildFalInput(collectedInputs, data.settings, model);

  // Auto-switch to /edit endpoint when image_urls are present
  // Models like nano-banana-pro and nano-banana-2 have separate generation and edit endpoints
  let effectiveModelId = modelId;
  const hasImageUrls = Array.isArray(falInput.image_urls) && (falInput.image_urls as unknown[]).length > 0;
  const editableModels: Record<string, string> = {
    'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro/edit',
    'fal-ai/nano-banana-2': 'fal-ai/nano-banana-2/edit',
  };
  if (hasImageUrls && editableModels[modelId]) {
    effectiveModelId = editableModels[modelId];
  }

  // Call our API route
  try {
    const res = await fetch('/api/fal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: effectiveModelId, input: falInput }),
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
