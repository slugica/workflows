'use client';

import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useViewport,
  useReactFlow,
  Panel,
  type NodeTypes,
  type IsValidConnection,
  type Node,
  type Edge,
  type Connection,
  type ConnectionLineComponentProps,
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore } from '@/store/flowStore';
import { BaseNode } from '@/components/nodes/BaseNode';
import { CropNode } from '@/components/nodes/CropNode';
import { ExportNode } from '@/components/nodes/ExportNode';
import { PreviewNode } from '@/components/nodes/PreviewNode';
import { FlowNodeType, HANDLE_COLORS, type FlowNodeData } from '@/lib/types';

function CustomConnectionLine({ fromX, fromY, toX, toY, fromNode, fromHandle }: ConnectionLineComponentProps) {
  const handleId = fromHandle?.id || '';
  const nodeData = fromNode?.data as unknown as FlowNodeData | undefined;
  const handle = nodeData?.handles.outputs.find(h => h.id === handleId)
    || nodeData?.handles.inputs.find(h => h.id === handleId);
  const color = handle ? HANDLE_COLORS[handle.type] : '#52525b';

  const [path] = getSmoothStepPath({
    sourceX: fromX, sourceY: fromY,
    targetX: toX, targetY: toY,
  });

  return <path d={path} fill="none" stroke={color} strokeWidth={2} />;
}

const nodeTypes: NodeTypes = {
  import: BaseNode,
  prompt: BaseNode,
  image: BaseNode,
  video: BaseNode,
  audio: BaseNode,
  textUtility: BaseNode,
  crop: CropNode,
  export: ExportNode,
  preview: PreviewNode,
};

function parseHandleInfo(handleId: string): { direction: string; type: string; key: string } | null {
  const parts = handleId.split('|');
  if (parts.length !== 2) return null;
  const segments = parts[1].split(':');
  if (segments.length !== 3) return null;
  return { direction: segments[0], type: segments[1], key: segments[2] };
}

function ZoomIndicator() {
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const pct = Math.round(zoom * 100);

  return (
    <div className="flex items-center gap-1 bg-[#171717] border border-[#212121] rounded-lg px-2 py-1 mb-2">
      <button
        className="text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
        onClick={() => zoomTo(Math.max(0.1, zoom - 0.25), { duration: 200 })}
      >
        −
      </button>
      <button
        className="text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded hover:bg-[#212121] transition-colors min-w-[44px] text-center"
        onClick={() => zoomTo(1, { duration: 200 })}
      >
        {pct}%
      </button>
      <button
        className="text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
        onClick={() => zoomTo(Math.min(2, zoom + 0.25), { duration: 200 })}
      >
        +
      </button>
      <button
        className="text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5 rounded transition-colors ml-1"
        onClick={() => fitView({ duration: 200 })}
        title="Fit to view"
      >
        ⊞
      </button>
    </div>
  );
}

export function FlowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
  } = useFlowStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<{ screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } } | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/flow-node-type') as FlowNodeType;
      const label = event.dataTransfer.getData('application/flow-node-label');
      if (!type) return;

      const position = reactFlowInstance.current
        ? reactFlowInstance.current.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : { x: event.clientX - 300, y: event.clientY - 50 };

      addNode(type, label, position);
    },
    [addNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    deleted.forEach((node) => {
      useFlowStore.getState().deleteNode(node.id);
    });
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    const store = useFlowStore.getState();
    // Remove old edge, add new connection
    store.onEdgesChange([{ id: oldEdge.id, type: 'remove' }]);
    store.onConnect(newConnection);
  }, []);

  const isValidConnection: IsValidConnection = useCallback((connection) => {
    const sourceHandle = connection.sourceHandle;
    const targetHandle = connection.targetHandle;
    if (!sourceHandle || !targetHandle) return false;
    const sourceInfo = parseHandleInfo(sourceHandle);
    const targetInfo = parseHandleInfo(targetHandle);
    if (!sourceInfo || !targetInfo) return false;
    if (sourceInfo.type !== targetInfo.type) return false;
    if (connection.source === connection.target) return false;
    return true;
  }, []);

  return (
    <div className="flex-1 h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodesDelete={onNodesDelete}
        onReconnect={onReconnect}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        nodeTypes={nodeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        colorMode="dark"
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { strokeWidth: 2 },
        }}
        connectionLineComponent={CustomConnectionLine}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={0.5} color="rgba(255,255,255,0.25)" />
        <Controls
          className="!bg-[#171717] !border-[#212121] !rounded-lg !shadow-xl"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#171717] !border-[#212121] !rounded-lg"
          nodeColor="#212121"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
        <Panel position="bottom-center">
          <ZoomIndicator />
        </Panel>
      </ReactFlow>
    </div>
  );
}
