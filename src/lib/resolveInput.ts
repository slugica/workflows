import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData } from '@/lib/types';

/**
 * Resolve the image URL coming into a node's input handle.
 * Walks the edge graph to find the source node and extracts the URL
 * from either settings.fileUrl (Import nodes) or results (AI/Crop nodes).
 */
export function resolveInputImageUrl(
  nodeId: string,
  allNodes: Node[],
  edges: Edge[]
): string | null {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle?.includes('input:image')
  );
  if (!incomingEdge) return null;

  const sourceNode = allNodes.find((n) => n.id === incomingEdge.source);
  if (!sourceNode) return null;

  const sourceData = sourceNode.data as unknown as FlowNodeData;

  if (sourceData.settings.fileUrl) {
    return sourceData.settings.fileUrl as string;
  }

  if (sourceData.results && sourceData.results.length > 0) {
    const result = sourceData.results[sourceData.selectedResultIndex || 0];
    if (result) {
      const entry = Object.values(result)[0];
      if (entry?.content) return entry.content;
    }
  }

  return null;
}
