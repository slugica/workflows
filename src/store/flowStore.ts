import { create } from 'zustand';
import {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  addEdge,
} from '@xyflow/react';
import { FlowNodeData, FlowNodeType, NODE_TEMPLATES, HandleDef } from '@/lib/types';
import { executeNode } from '@/lib/executeNode';

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

type DrawingMode = 'none' | 'section';

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  drawingMode: DrawingMode;
  setDrawingMode: (mode: DrawingMode) => void;
  connectingHandleType: string | null;
  setConnectingHandleType: (type: string | null) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: FlowNodeType, templateLabel: string, position: { x: number; y: number }) => void;
  addSection: (position: { x: number; y: number }, size?: { width: number; height: number }) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<FlowNodeData>) => void;
  updateNodeSetting: (id: string, key: string, value: unknown) => void;
  addConnectedNode: (sourceId: string, type: FlowNodeType, templateLabel: string) => void;
  deleteNode: (id: string) => void;
  runNode: (id: string) => Promise<void>;
  uploadFileToNewNode: (file: File, position: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  pushUndo: () => void;
  toJSON: () => string;
  loadJSON: (json: string) => void;
}

function generateId() {
  return crypto.randomUUID();
}

function parseHandleType(handleId: string): string | null {
  const parts = handleId.split('|');
  if (parts.length !== 2) return null;
  const segments = parts[1].split(':');
  if (segments.length !== 3) return null;
  return segments[1];
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  undoStack: [],
  redoStack: [],
  drawingMode: 'none',
  setDrawingMode: (mode) => set({ drawingMode: mode }),
  connectingHandleType: null,
  setConnectingHandleType: (type) => set({ connectingHandleType: type }),

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    const newEdges = applyEdgeChanges(changes, get().edges);

    // Clean up unused dynamic handles when edges are removed
    const hasRemovals = changes.some((c) => c.type === 'remove');
    if (hasRemovals) {
      const connectedHandleIds = new Set(newEdges.map((e) => e.targetHandle));
      const updatedNodes = get().nodes.map((n) => {
        const data = n.data as unknown as FlowNodeData;
        if (!data.handles?.inputs) return n;
        const dynamicBases = new Set(
          data.handles.inputs.filter((h: HandleDef) => h.dynamic && h.dynamicBase).map((h: HandleDef) => h.dynamicBase)
        );
        if (dynamicBases.size === 0) return n;

        let changed = false;
        let newInputs = [...data.handles.inputs];
        for (const base of dynamicBases) {
          const group = newInputs.filter((h: HandleDef) => h.dynamicBase === base);
          // Remove trailing unconnected handles, keeping at least 1
          const toKeep: HandleDef[] = [];
          let foundLastConnected = false;
          for (let i = group.length - 1; i >= 0; i--) {
            if (foundLastConnected || connectedHandleIds.has(group[i].id) || i === 0) {
              foundLastConnected = true;
              toKeep.unshift(group[i]);
            } else {
              changed = true;
            }
          }
          if (changed) {
            // Rebuild: keep non-group handles in order, insert kept group handles where the group started
            const firstGroupIdx = newInputs.findIndex((h: HandleDef) => h.dynamicBase === base);
            const before = newInputs.filter((h: HandleDef, i: number) => i < firstGroupIdx && h.dynamicBase !== base);
            const after = newInputs.filter((h: HandleDef, i: number) => i > firstGroupIdx && h.dynamicBase !== base);
            newInputs = [...before, ...toKeep, ...after];
          }
        }
        if (!changed) return n;
        return {
          ...n,
          data: { ...data, handles: { ...data.handles, inputs: newInputs } } as unknown as Record<string, unknown>,
        };
      });
      set({ edges: newEdges, nodes: updatedNodes });
    } else {
      set({ edges: newEdges });
    }
  },

  onConnect: (connection: Connection) => {
    const { sourceHandle, targetHandle } = connection;
    if (!sourceHandle || !targetHandle) return;

    const sourceType = parseHandleType(sourceHandle);
    const targetType = parseHandleType(targetHandle);
    if (!sourceType || !targetType) return;
    const mediaTypes = new Set(['file', 'image', 'video', 'audio']);
    const typesMatch = sourceType === targetType
      || sourceType === 'file' && mediaTypes.has(targetType)
      || targetType === 'file' && mediaTypes.has(sourceType);
    if (!typesMatch) return;

    get().pushUndo();

    // Replace existing connection to the same target handle (allows reconnecting)
    const filteredEdges = get().edges.filter((e) => e.targetHandle !== targetHandle);

    const newEdge: Edge = {
      ...connection,
      id: `${connection.source}-${connection.target}-${generateId()}`,
      type: 'dynamic',
    };
    const newEdges = addEdge(newEdge, filteredEdges);

    // Dynamic handle spawning: if the connected target handle is dynamic,
    // add a new empty handle slot (up to maxDynamic)
    const targetNodeId = connection.target;
    const updatedNodes = get().nodes.map((n) => {
      if (n.id !== targetNodeId) return n;
      const data = n.data as unknown as FlowNodeData;
      const connectedHandle = data.handles.inputs.find((h: HandleDef) => h.id === targetHandle);
      if (!connectedHandle?.dynamic || !connectedHandle.dynamicBase || !connectedHandle.maxDynamic) {
        return n;
      }

      // Count how many handles share this dynamicBase
      const base = connectedHandle.dynamicBase;
      const existing = data.handles.inputs.filter((h: HandleDef) => h.dynamicBase === base);
      if (existing.length >= connectedHandle.maxDynamic) return n;

      // Check if there's already an unconnected one — if so, don't add another
      const connectedHandleIds = new Set(
        newEdges.filter((e) => e.target === targetNodeId).map((e) => e.targetHandle)
      );
      const hasEmpty = existing.some((h: HandleDef) => !connectedHandleIds.has(h.id));
      if (hasEmpty) return n;

      // Spawn a new handle
      const nextIndex = existing.length + 1;
      const newHandle: HandleDef = {
        id: `${targetNodeId}|input:${connectedHandle.type}:${base}_${nextIndex}`,
        key: `${base}_${nextIndex}`,
        label: connectedHandle.label,
        type: connectedHandle.type,
        required: false,
        dynamic: true,
        maxDynamic: connectedHandle.maxDynamic,
        dynamicBase: base,
      };
      return {
        ...n,
        data: {
          ...data,
          handles: {
            ...data.handles,
            inputs: [...data.handles.inputs, newHandle],
          },
        } as unknown as Record<string, unknown>,
      };
    });

    set({ edges: newEdges, nodes: updatedNodes });
  },

  addNode: (type, templateLabel, position) => {
    const template = NODE_TEMPLATES.find((t) => t.type === type && t.label === templateLabel);
    if (!template) return;
    get().pushUndo();

    const nodeId = generateId();
    const existingCount = get().nodes.filter((n) => n.type === type).length;
    const name = `${template.label} ${existingCount + 1}`;

    const inputs = (template.defaultData.handles?.inputs || []).map((h) => ({
      ...h,
      id: `${nodeId}|input:${h.type}:${h.key}`,
    }));
    const outputs = (template.defaultData.handles?.outputs || []).map((h) => ({
      ...h,
      id: `${nodeId}|output:${h.type}:${h.key}`,
    }));

    const data: FlowNodeData = {
      name,
      behavior: template.defaultData.behavior || 'static',
      handles: { inputs, outputs },
      settings: { ...(template.defaultData.settings || {}) },
      outputs: {},
      results: [],
      selectedResultIndex: 0,
      status: 'idle',
      errorMessage: '',
    };

    const newNode: Node = {
      id: nodeId,
      type,
      position,
      data: data as unknown as Record<string, unknown>,
      ...(type === 'prompt' ? { style: { width: 356, height: 280 } } : {}),
    };

    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }],
      selectedNodeId: nodeId,
    });
  },

  addConnectedNode: (sourceId, type, templateLabel) => {
    const sourceNode = get().nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return;
    const sourceData = sourceNode.data as unknown as FlowNodeData;

    // Find source output handle (prefer file/image/video)
    const sourceOutput = sourceData.handles.outputs.find(
      (h) => h.type === 'file' || h.type === 'image' || h.type === 'video'
    );
    if (!sourceOutput) return;

    // Position new node to the right
    const newPos = {
      x: sourceNode.position.x + (sourceNode.measured?.width ?? 400) + 100,
      y: sourceNode.position.y,
    };

    // Create the node (this pushes undo, sets selectedNodeId)
    get().addNode(type, templateLabel, newPos);
    const newNodeId = get().selectedNodeId;
    if (!newNodeId) return;

    // Find target input handle (prefer image, then file, then video)
    const newNode = get().nodes.find((n) => n.id === newNodeId);
    if (!newNode) return;
    const newData = newNode.data as unknown as FlowNodeData;
    const targetInput =
      newData.handles.inputs.find((h) => h.type === 'image') ||
      newData.handles.inputs.find((h) => h.type === 'file') ||
      newData.handles.inputs.find((h) => h.type === 'video');
    if (!targetInput) return;

    // Connect via onConnect (handles edge creation + dynamic handle spawning)
    get().onConnect({
      source: sourceId,
      target: newNodeId,
      sourceHandle: sourceOutput.id,
      targetHandle: targetInput.id,
    });

    // Re-select the new node
    set({ selectedNodeId: newNodeId });
  },

  addSection: (position, size) => {
    get().pushUndo();
    const nodeId = generateId();
    const existingCount = get().nodes.filter((n) => n.type === 'section').length;
    const w = size?.width ?? 600;
    const h = size?.height ?? 400;
    const newNode: Node = {
      id: nodeId,
      type: 'section',
      position,
      data: { label: `Section ${existingCount + 1}` },
      style: { width: w, height: h },
    };
    // Parent existing nodes that fall inside the new section
    const sx = position.x;
    const sy = position.y;
    const updatedNodes = get().nodes.map((n) => {
      if (n.type === 'section' || n.parentId) return { ...n, selected: false };
      const nx = n.position.x;
      const ny = n.position.y;
      if (nx > sx && ny > sy && nx < sx + w && ny < sy + h) {
        return {
          ...n,
          selected: false,
          parentId: nodeId,
          position: { x: nx - sx, y: ny - sy },
        };
      }
      return { ...n, selected: false };
    });
    // Sections must come before other nodes for proper z-ordering
    set({
      nodes: [{ ...newNode, selected: true }, ...updatedNodes],
      selectedNodeId: nodeId,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeData: (id, partialData) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const current = n.data as unknown as FlowNodeData;
        return { ...n, data: { ...current, ...partialData } as unknown as Record<string, unknown> };
      }),
    });
  },

  updateNodeSetting: (id, key, value) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const current = n.data as unknown as FlowNodeData;
        return {
          ...n,
          data: {
            ...current,
            settings: { ...current.settings, [key]: value },
          } as unknown as Record<string, unknown>,
        };
      }),
    });
  },

  deleteNode: (id) => {
    get().pushUndo();
    const deletedNode = get().nodes.find((n) => n.id === id);
    const isSection = deletedNode?.type === 'section';
    set({
      nodes: get().nodes
        .filter((n) => n.id !== id)
        .map((n) => {
          // Unparent children when section is deleted — convert to absolute position
          if (isSection && n.parentId === id) {
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: {
                x: n.position.x + (deletedNode?.position.x || 0),
                y: n.position.y + (deletedNode?.position.y || 0),
              },
            };
          }
          return n;
        }),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  runNode: async (id) => {
    const store = get();
    const node = store.nodes.find((n) => n.id === id);
    if (!node) return;

    // Set running status
    store.updateNodeData(id, { status: 'running', errorMessage: '' });

    try {
      const result = await executeNode(id, get().nodes, get().edges);
      if (result.success && result.results) {
        const currentData = (get().nodes.find(n => n.id === id)?.data as unknown as FlowNodeData);
        const existingResults = currentData?.results || [];
        const allResults = [...existingResults, ...result.results];
        store.updateNodeData(id, {
          status: 'done',
          results: allResults,
          selectedResultIndex: allResults.length - 1,
        });
      } else {
        store.updateNodeData(id, {
          status: 'error',
          errorMessage: result.error || 'Unknown error',
        });
      }
    } catch (err) {
      store.updateNodeData(id, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  uploadFileToNewNode: (file, position) => {
    const MAX_SIZE = 30 * 1024 * 1024; // 30MB
    if (file.size > MAX_SIZE) {
      console.warn(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 30MB.`);
      return;
    }
    // Create the node
    get().addNode('import', 'Import', position);

    // Get the newly created node (last selected)
    const nodeId = get().selectedNodeId;
    if (!nodeId) return;

    const store = get();
    const localUrl = URL.createObjectURL(file);
    store.updateNodeSetting(nodeId, 'fileName', file.name);
    store.updateNodeSetting(nodeId, 'fileUrl', localUrl);
    store.updateNodeSetting(nodeId, 'fileType', file.type);
    store.updateNodeSetting(nodeId, 'uploading', true);

    fetch('/api/fal/upload', {
      method: 'POST',
      body: (() => { const fd = new FormData(); fd.append('file', file); return fd; })(),
    })
      .then((res) => { if (!res.ok) throw new Error('Upload failed'); return res.json(); })
      .then((json) => {
        if (json.url) {
          const s = useFlowStore.getState();
          s.updateNodeSetting(nodeId, 'remoteUrl', json.url);
          URL.revokeObjectURL(localUrl);
          s.updateNodeSetting(nodeId, 'fileUrl', json.url);
        }
      })
      .catch((err) => console.error('Upload error:', err))
      .finally(() => {
        useFlowStore.getState().updateNodeSetting(nodeId, 'uploading', false);
      });
  },

  pushUndo: () => {
    const { nodes, edges, undoStack } = get();
    const snapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({ undoStack: [...undoStack.slice(-49), snapshot], redoStack: [] });
  },

  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const currentSnapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, currentSnapshot],
    });
  },

  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const currentSnapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      nodes: next.nodes,
      edges: next.edges,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, currentSnapshot],
    });
  },

  toJSON: () => {
    const { nodes, edges } = get();
    return JSON.stringify({ graph: { nodes, edges } }, null, 2);
  },

  loadJSON: (json) => {
    try {
      const data = JSON.parse(json);
      if (data.graph) {
        set({ nodes: data.graph.nodes, edges: data.graph.edges, selectedNodeId: null });
      }
    } catch (e) {
      console.error('Failed to load graph:', e);
    }
  },
}));
