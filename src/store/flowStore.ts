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
import { FlowNodeData, FlowNodeType, NODE_TEMPLATES, HandleDef, HANDLE_COLORS, HandleDataType } from '@/lib/types';
import { executeNode } from '@/lib/executeNode';

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: FlowNodeType, templateLabel: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<FlowNodeData>) => void;
  updateNodeSetting: (id: string, key: string, value: unknown) => void;
  deleteNode: (id: string) => void;
  runNode: (id: string) => Promise<void>;
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
            const nonGroup = newInputs.filter((h: HandleDef) => h.dynamicBase !== base);
            // Insert kept handles at the position of the first group handle
            const firstGroupIdx = newInputs.findIndex((h: HandleDef) => h.dynamicBase === base);
            newInputs = [
              ...nonGroup.slice(0, firstGroupIdx),
              ...toKeep,
              ...nonGroup.slice(firstGroupIdx),
            ];
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
    if (!sourceType || !targetType || sourceType !== targetType) return;

    // Prevent multiple connections to the same target handle
    const existingEdgeToHandle = get().edges.find((e) => e.targetHandle === targetHandle);
    if (existingEdgeToHandle) return;

    const edgeColor = HANDLE_COLORS[sourceType as HandleDataType] || '#52525b';
    const newEdge: Edge = {
      ...connection,
      id: `${connection.source}-${connection.target}-${generateId()}`,
      type: 'smoothstep',
      style: { stroke: edgeColor, strokeWidth: 2 },
    };
    const newEdges = addEdge(newEdge, get().edges);

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
    };

    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), { ...newNode, selected: true }],
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
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
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
        store.updateNodeData(id, {
          status: 'done',
          results: result.results,
          selectedResultIndex: 0,
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
