'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  useViewport,
  useReactFlow,
  useEdges,
  useNodes,
  Panel,
  type NodeTypes,
  type IsValidConnection,
  type Node,
  type Edge,
  type Connection,
  type ConnectionLineComponentProps,
  getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore } from '@/store/flowStore';
import { BaseNode } from '@/components/nodes/BaseNode';
import { CropNode } from '@/components/nodes/CropNode';
import { ExportNode } from '@/components/nodes/ExportNode';
import { PreviewNode } from '@/components/nodes/PreviewNode';
import { BlurNode } from '@/components/nodes/BlurNode';
import { ResizeNode } from '@/components/nodes/ResizeNode';
import { FiltersNode } from '@/components/nodes/FiltersNode';
import { LevelsNode } from '@/components/nodes/LevelsNode';
import { SplitImageNode } from '@/components/nodes/SplitImageNode';
import { ImageIteratorNode } from '@/components/nodes/ImageIteratorNode';
import { AiResizeNode } from '@/components/nodes/AiResizeNode';
import { RelightNode } from '@/components/nodes/RelightNode';
import { CameraAnglesNode } from '@/components/nodes/CameraAnglesNode';
import { SectionNode } from '@/components/nodes/SectionNode';
import { TrimVideoNode } from '@/components/nodes/TrimVideoNode';
import { FlowNodeType, HANDLE_COLORS, resolveFileHandleColor, type FlowNodeData } from '@/lib/types';

import { BaseEdge, type EdgeProps } from '@xyflow/react';

/** Resolve edge/connection color from a source node + handle. */
function useSourceHandleColor(nodeId: string | undefined, handleId: string | undefined): string {
  const rfNodes = useNodes();
  const rfEdges = useEdges();
  const node = rfNodes.find(n => n.id === nodeId);
  const nodeData = node?.data as unknown as FlowNodeData | undefined;
  const handle = nodeData?.handles.outputs.find(h => h.id === handleId)
    || nodeData?.handles.inputs.find(h => h.id === handleId);
  if (!handle) return '#52525b';
  if (handle.type !== 'file') return HANDLE_COLORS[handle.type];
  if (!nodeData || !node) return HANDLE_COLORS.file;
  return resolveFileHandleColor('output', nodeData, handleId || '', rfEdges, node.id, rfNodes);
}

function CustomConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromNode, fromHandle }: ConnectionLineComponentProps) {
  const color = useSourceHandleColor(fromNode?.id, fromHandle?.id || '');
  const [path] = getBezierPath({
    sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition,
    targetX: toX, targetY: toY, targetPosition: toPosition,
  });
  return <path d={path} fill="none" stroke={color} strokeWidth={2} />;
}

function DynamicEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, sourceHandleId } = props;
  const color = useSourceHandleColor(source, sourceHandleId || undefined);
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={path} style={{ stroke: color, strokeWidth: 2 }} />;
}

const edgeTypes = { dynamic: DynamicEdge };

const nodeTypes: NodeTypes = {
  import: BaseNode,
  prompt: BaseNode,
  image: BaseNode,
  video: BaseNode,
  audio: BaseNode,
  crop: CropNode,
  export: ExportNode,
  preview: PreviewNode,
  blur: BlurNode,
  resize: ResizeNode,
  filters: FiltersNode,
  levels: LevelsNode,
  splitImage: SplitImageNode,
  imageIterator: ImageIteratorNode,
  aiResize: AiResizeNode,
  relight: RelightNode,
  cameraAngles: CameraAnglesNode,
  section: SectionNode,
  extractFrame: BaseNode,
  trimVideo: TrimVideoNode,
  combineAudioVideo: BaseNode,
  combineVideo: BaseNode,
  videoIterator: BaseNode,
};

function parseHandleInfo(handleId: string): { direction: string; type: string; key: string } | null {
  const parts = handleId.split('|');
  if (parts.length !== 2) return null;
  const segments = parts[1].split(':');
  if (segments.length !== 3) return null;
  return { direction: segments[0], type: segments[1], key: segments[2] };
}

function BottomBar() {
  const { zoom } = useViewport();
  const { zoomTo, fitView, screenToFlowPosition } = useReactFlow();
  const uploadFileToNewNode = useFlowStore((s) => s.uploadFileToNewNode);
  const drawingMode = useFlowStore((s) => s.drawingMode);
  const setDrawingMode = useFlowStore((s) => s.setDrawingMode);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const undoStack = useFlowStore((s) => s.undoStack);
  const redoStack = useFlowStore((s) => s.redoStack);
  const pct = Math.round(zoom * 100);
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (zoomRef.current && !zoomRef.current.contains(e.target as HTMLElement)) {
        setZoomOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape' && drawingMode !== 'none') {
        setDrawingMode('none');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo, drawingMode, setDrawingMode]);

  const handleSectionClick = () => {
    setDrawingMode(drawingMode === 'section' ? 'none' : 'section');
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    uploadFileToNewNode(file, center);
    e.target.value = '';
  };

  const btnBase = 'flex items-center justify-center w-9 h-9 rounded-xl transition-colors';
  const btnDefault = `${btnBase} text-zinc-400 hover:text-white hover:bg-[#2a2a2a]`;
  const btnActive = `${btnBase} text-white bg-[#2a2a2a]`;

  return (
    <div className="flex items-center gap-1 mb-2">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        onChange={handleFileChange}
      />
      {/* Main tool group */}
      <div className="flex items-center gap-0.5 bg-[#141414] border border-[#222] rounded-2xl px-1 py-1">
        {/* Select tool */}
        <button
          className={drawingMode === 'none' ? btnActive : btnDefault}
          onClick={() => setDrawingMode('none')}
          title="Select (V)"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 2l14 10.5-5.5 1.5L9 20z" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[#2a2a2a] mx-0.5" />

        {/* Section */}
        <button
          className={drawingMode === 'section' ? btnActive : btnDefault}
          onClick={handleSectionClick}
          title="Draw Section"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x={3} y={3} width={18} height={18} rx={3} strokeDasharray="4 3" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-[#2a2a2a] mx-0.5" />

        {/* Upload */}
        <button
          className={btnDefault}
          onClick={handleUpload}
          title="Upload File"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1={12} y1={3} x2={12} y2={15} />
          </svg>
        </button>
      </div>

      {/* Zoom group */}
      <div className="relative" ref={zoomRef}>
        <button
          className="flex items-center gap-1 bg-[#141414] border border-[#222] rounded-2xl px-3 py-1 h-[44px] text-[12px] text-zinc-300 hover:text-white transition-colors min-w-[72px] justify-center"
          onClick={() => setZoomOpen(!zoomOpen)}
        >
          {pct}%
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`transition-transform ${zoomOpen ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Zoom dropdown */}
        {zoomOpen && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl py-1 min-w-[160px] shadow-xl">
            {[
              { label: 'Zoom in', action: () => zoomTo(Math.min(2, zoom + 0.25), { duration: 200 }), shortcut: '⌘+' },
              { label: 'Zoom out', action: () => zoomTo(Math.max(0.1, zoom - 0.25), { duration: 200 }), shortcut: '⌘−' },
              { label: 'Zoom to fit', action: () => fitView({ duration: 200 }), shortcut: '⌘1' },
              null,
              { label: 'Zoom to 50%', action: () => zoomTo(0.5, { duration: 200 }) },
              { label: 'Zoom to 100%', action: () => zoomTo(1, { duration: 200 }) },
              { label: 'Zoom to 200%', action: () => zoomTo(2, { duration: 200 }) },
            ].map((item, i) =>
              item === null ? (
                <div key={i} className="h-px bg-[#2a2a2a] my-1" />
              ) : (
                <button
                  key={i}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-zinc-300 hover:text-white hover:bg-[#252525] transition-colors"
                  onClick={() => { item.action(); setZoomOpen(false); }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span className="text-zinc-600 text-[11px]">{item.shortcut}</span>}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Undo/Redo group */}
      <div className="flex items-center gap-0.5 bg-[#141414] border border-[#222] rounded-2xl px-1 py-1">
        <button
          className={`${btnBase} ${undoStack.length > 0 ? 'text-zinc-400 hover:text-white hover:bg-[#2a2a2a]' : 'text-zinc-600 cursor-not-allowed'}`}
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          className={`${btnBase} ${redoStack.length > 0 ? 'text-zinc-400 hover:text-white hover:bg-[#2a2a2a]' : 'text-zinc-600 cursor-not-allowed'}`}
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Y)"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SectionDrawingOverlay() {
  const { screenToFlowPosition } = useReactFlow();
  const addSection = useFlowStore((s) => s.addSection);
  const drawingMode = useFlowStore((s) => s.drawingMode);
  const setDrawingMode = useFlowStore((s) => s.setDrawingMode);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [start, setStart] = useState({ x: 0, y: 0 });
  // Store raw clientX/Y for screenToFlowPosition (needs viewport coords)
  const [startClient, setStartClient] = useState({ x: 0, y: 0 });
  const [mouseClient, setMouseClient] = useState({ x: 0, y: 0 });

  if (drawingMode !== 'section') return null;

  const toLocal = (e: React.MouseEvent) => {
    const r = overlayRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: e.clientX, y: e.clientY };
  };

  const rect = drawing ? {
    left: Math.min(start.x, mouse.x),
    top: Math.min(start.y, mouse.y),
    width: Math.abs(mouse.x - start.x),
    height: Math.abs(mouse.y - start.y),
  } : null;

  const preview = !drawing ? {
    left: mouse.x + 12,
    top: mouse.y + 12,
    width: 120,
    height: 80,
  } : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{ cursor: 'crosshair' }}
      onMouseMove={(e) => {
        const local = toLocal(e);
        setMouse(local);
        setMouseClient({ x: e.clientX, y: e.clientY });
      }}
      onMouseDown={(e) => {
        const local = toLocal(e);
        setDrawing(true);
        setStart(local);
        setMouse(local);
        setStartClient({ x: e.clientX, y: e.clientY });
        setMouseClient({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={() => {
        if (drawing) {
          if (rect && rect.width > 20 && rect.height > 20) {
            const clientRect = {
              left: Math.min(startClient.x, mouseClient.x),
              top: Math.min(startClient.y, mouseClient.y),
              right: Math.max(startClient.x, mouseClient.x),
              bottom: Math.max(startClient.y, mouseClient.y),
            };
            const pos = screenToFlowPosition({ x: clientRect.left, y: clientRect.top });
            const bottomRight = screenToFlowPosition({ x: clientRect.right, y: clientRect.bottom });
            addSection(pos, { width: bottomRight.x - pos.x, height: bottomRight.y - pos.y });
          } else {
            // Click without drag — add default size section at click point
            const pos = screenToFlowPosition({ x: startClient.x, y: startClient.y });
            addSection({ x: pos.x - 300, y: pos.y - 200 });
          }
        }
        setDrawing(false);
        setDrawingMode('none');
      }}
    >
      {preview && (
        <div
          className="absolute border border-[#555] bg-[#0a0a0a]/30 pointer-events-none"
          style={{ left: preview.left, top: preview.top, width: preview.width, height: preview.height }}
        />
      )}
      {rect && rect.width > 0 && rect.height > 0 && (
        <div
          className="absolute border border-[#555] bg-[#0a0a0a]/40 pointer-events-none"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
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
  const drawingMode = useFlowStore((s) => s.drawingMode);
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

  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    // Don't parent sections to other sections
    if (draggedNode.type === 'section') return;
    // Already has a parent — check if still inside
    const store = useFlowStore.getState();
    const allNodes = store.nodes;

    if (draggedNode.parentId) {
      const parent = allNodes.find((n) => n.id === draggedNode.parentId);
      if (parent) {
        const pw = (parent.measured?.width ?? (parent.style?.width as number) ?? 600);
        const ph = (parent.measured?.height ?? (parent.style?.height as number) ?? 400);
        const nx = draggedNode.position.x;
        const ny = draggedNode.position.y;
        // If dragged outside parent bounds, unparent
        if (nx < -50 || ny < -50 || nx > pw + 50 || ny > ph + 50) {
          const updatedNodes = allNodes.map((n) =>
            n.id === draggedNode.id
              ? {
                  ...n,
                  parentId: undefined,
                  extent: undefined,
                  position: {
                    x: n.position.x + parent.position.x,
                    y: n.position.y + parent.position.y,
                  },
                }
              : n
          );
          useFlowStore.setState({ nodes: updatedNodes });
        }
      }
      return;
    }

    // No parent yet — check if dropped inside any section
    const sections = allNodes.filter((n) => n.type === 'section');
    for (const section of sections) {
      const sw = (section.measured?.width ?? (section.style?.width as number) ?? 600);
      const sh = (section.measured?.height ?? (section.style?.height as number) ?? 400);
      const sx = section.position.x;
      const sy = section.position.y;
      const nx = draggedNode.position.x;
      const ny = draggedNode.position.y;

      if (nx > sx && ny > sy && nx < sx + sw && ny < sy + sh) {
        // Parent this node to the section
        const updatedNodes = allNodes.map((n) =>
          n.id === draggedNode.id
            ? {
                ...n,
                parentId: section.id,
                position: {
                  x: nx - sx,
                  y: ny - sy,
                },
              }
            : n
        );
        // Ensure section comes before its children
        const sorted = [
          ...updatedNodes.filter((n) => n.type === 'section'),
          ...updatedNodes.filter((n) => n.type !== 'section'),
        ];
        useFlowStore.setState({ nodes: sorted });
        return;
      }
    }
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
    const fileTypes = new Set(['file', 'image', 'video']);
    const typesMatch = sourceInfo.type === targetInfo.type
      || (fileTypes.has(sourceInfo.type) && fileTypes.has(targetInfo.type));
    if (!typesMatch) return false;
    if (connection.source === connection.target) return false;
    return true;
  }, []);

  return (
    <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
      <SectionDrawingOverlay />
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
        onNodeDragStop={onNodeDragStop}
        onReconnect={onReconnect}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        nodeTypes={nodeTypes}
        selectionOnDrag={drawingMode === 'none'}
        panOnDrag={false}
        panOnScroll
        panActivationKeyCode="Space"
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ maxZoom: 1 }}
        colorMode="dark"
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: 'dynamic',
          animated: false,
        }}
        connectionLineComponent={CustomConnectionLine}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={0.5} color="rgba(255,255,255,0.25)" />
        <MiniMap
          className="!bg-[#171717] !border-[#212121] !rounded-lg"
          nodeColor="#212121"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
        <Panel position="bottom-center">
          <BottomBar />
        </Panel>
      </ReactFlow>
    </div>
  );
}
