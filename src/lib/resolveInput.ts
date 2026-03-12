import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData } from '@/lib/types';

export interface ResolvedInput {
  url: string;
  mediaType: 'image' | 'video';
}

/**
 * Resolve the media URL coming into a node's file/image/video input handle.
 * Returns the URL and whether it's an image or video.
 */
export function resolveInput(
  nodeId: string,
  allNodes: Node[],
  edges: Edge[]
): ResolvedInput | null {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle &&
      (e.targetHandle.includes('input:image') || e.targetHandle.includes('input:file') || e.targetHandle.includes('input:video'))
  );
  if (!incomingEdge) return null;

  const sourceNode = allNodes.find((n) => n.id === incomingEdge.source);
  if (!sourceNode) return null;

  const sourceData = sourceNode.data as unknown as FlowNodeData;

  // Detect media type from source
  const fileType = sourceData.settings.fileType as string | undefined;
  const isVideo = fileType?.startsWith('video/') || false;

  if (sourceData.settings.fileUrl) {
    return {
      url: sourceData.settings.fileUrl as string,
      mediaType: isVideo ? 'video' : 'image',
    };
  }

  if (sourceData.results && sourceData.results.length > 0) {
    const sourceHandleKey = incomingEdge.sourceHandle?.split(':').pop();
    const selectedResult = sourceData.results[sourceData.selectedResultIndex || 0];

    // First try the selected result by handle key
    if (sourceHandleKey && selectedResult?.[sourceHandleKey]?.content) {
      const format = selectedResult[sourceHandleKey].format;
      return {
        url: selectedResult[sourceHandleKey].content,
        mediaType: format === 'video' ? 'video' : isVideo ? 'video' : 'image',
      };
    }

    // For split-output nodes
    if (sourceHandleKey) {
      for (const result of sourceData.results) {
        if (result[sourceHandleKey]?.content) {
          const format = result[sourceHandleKey].format;
          return {
            url: result[sourceHandleKey].content,
            mediaType: format === 'video' ? 'video' : isVideo ? 'video' : 'image',
          };
        }
      }
    }

    // Fallback
    if (selectedResult) {
      const entry = Object.values(selectedResult)[0];
      if (entry?.content) {
        return {
          url: entry.content,
          mediaType: entry.format === 'video' ? 'video' : isVideo ? 'video' : 'image',
        };
      }
    }
  }

  return null;
}

/** Backward-compatible wrapper */
export function resolveInputImageUrl(
  nodeId: string,
  allNodes: Node[],
  edges: Edge[]
): string | null {
  return resolveInput(nodeId, allNodes, edges)?.url ?? null;
}
