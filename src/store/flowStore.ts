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
import { FlowNodeData, FlowNodeType, NODE_TEMPLATES, HandleDef, detectMediaType } from '@/lib/types';
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
  addConnectedNodeAt: (sourceId: string, type: FlowNodeType, templateLabel: string, position: { x: number; y: number }) => void;
  deleteNode: (id: string) => void;
  runNode: (id: string) => Promise<void>;
  uploadFileToNewNode: (file: File, position: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  pushUndo: () => void;
  alignNodes: (nodeIds: string[], alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom' | 'distributeH' | 'distributeV') => void;
  tidyUpNodes: (nodeIds: string[]) => void;
  wrapInSection: (nodeIds: string[]) => void;
  duplicateSection: (sectionId: string) => void;
  ungroupSection: (sectionId: string) => void;
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
    const existingCount = get().nodes.filter((n) => {
      const nd = n.data as unknown as FlowNodeData;
      return nd.name?.startsWith(template.label);
    }).length;
    const name = existingCount > 0 ? `${template.label} ${existingCount + 1}` : template.label;

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

    // Find target input handle — use runtime media type for best match
    const newNode = get().nodes.find((n) => n.id === newNodeId);
    if (!newNode) return;
    const newData = newNode.data as unknown as FlowNodeData;
    const actualType = detectMediaType(sourceData) || sourceOutput.type;
    const targetInput =
      newData.handles.inputs.find((h) => h.type === actualType) ||
      newData.handles.inputs.find((h) => h.type === 'file') ||
      newData.handles.inputs.find((h) => h.type === 'image') ||
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

  addConnectedNodeAt: (sourceId, type, templateLabel, position) => {
    const sourceNode = get().nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return;
    const sourceData = sourceNode.data as unknown as FlowNodeData;

    const sourceOutput = sourceData.handles.outputs.find(
      (h) => h.type === 'file' || h.type === 'image' || h.type === 'video' || h.type === 'text' || h.type === 'audio'
    );
    if (!sourceOutput) return;

    get().addNode(type, templateLabel, position);
    const newNodeId = get().selectedNodeId;
    if (!newNodeId) return;

    const newNode = get().nodes.find((n) => n.id === newNodeId);
    if (!newNode) return;
    const newData = newNode.data as unknown as FlowNodeData;

    // Find compatible input: runtime media type first, then static type, then fallback
    const actualType = detectMediaType(sourceData) || sourceOutput.type;
    const targetInput =
      newData.handles.inputs.find((h) => h.type === actualType) ||
      newData.handles.inputs.find((h) => h.type === 'file') ||
      newData.handles.inputs.find((h) => h.type === 'image') ||
      newData.handles.inputs.find((h) => h.type === 'video');
    if (!targetInput) return;

    get().onConnect({
      source: sourceId,
      target: newNodeId,
      sourceHandle: sourceOutput.id,
      targetHandle: targetInput.id,
    });

    set({ selectedNodeId: newNodeId });
  },

  addSection: (position, size) => {
    get().pushUndo();
    const nodeId = generateId();
    const w = size?.width ?? 600;
    const h = size?.height ?? 400;
    const newNode: Node = {
      id: nodeId,
      type: 'section',
      position,
      data: { label: `Section ${get().nodes.filter((n) => n.type === 'section').length + 1}` },
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

  alignNodes: (nodeIds, alignment) => {
    const store = get();
    store.pushUndo();
    const nodes = store.nodes;
    const targets = nodes.filter((n) => nodeIds.includes(n.id) && n.type !== 'section');
    if (targets.length < 2) return;

    // Resolve absolute positions
    const getAbsPos = (n: Node) => {
      if (n.parentId) {
        const parent = nodes.find((p) => p.id === n.parentId);
        return parent
          ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
          : n.position;
      }
      return n.position;
    };
    const getW = (n: Node) => n.measured?.width ?? (n.style?.width as number) ?? 200;
    const getH = (n: Node) => n.measured?.height ?? (n.style?.height as number) ?? 200;

    const absPositions = new Map(targets.map((n) => [n.id, getAbsPos(n)]));

    let newAbsPositions: Map<string, { x: number; y: number }>;

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...targets.map((n) => absPositions.get(n.id)!.x));
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: minX, y: absPositions.get(n.id)!.y }]));
        break;
      }
      case 'right': {
        const maxR = Math.max(...targets.map((n) => absPositions.get(n.id)!.x + getW(n)));
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: maxR - getW(n), y: absPositions.get(n.id)!.y }]));
        break;
      }
      case 'centerH': {
        const cx = targets.reduce((s, n) => s + absPositions.get(n.id)!.x + getW(n) / 2, 0) / targets.length;
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: cx - getW(n) / 2, y: absPositions.get(n.id)!.y }]));
        break;
      }
      case 'top': {
        const minY = Math.min(...targets.map((n) => absPositions.get(n.id)!.y));
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: absPositions.get(n.id)!.x, y: minY }]));
        break;
      }
      case 'bottom': {
        const maxB = Math.max(...targets.map((n) => absPositions.get(n.id)!.y + getH(n)));
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: absPositions.get(n.id)!.x, y: maxB - getH(n) }]));
        break;
      }
      case 'centerV': {
        const cy = targets.reduce((s, n) => s + absPositions.get(n.id)!.y + getH(n) / 2, 0) / targets.length;
        newAbsPositions = new Map(targets.map((n) => [n.id, { x: absPositions.get(n.id)!.x, y: cy - getH(n) / 2 }]));
        break;
      }
      case 'distributeH': {
        const sorted = [...targets].sort((a, b) => absPositions.get(a.id)!.x - absPositions.get(b.id)!.x);
        const minX = absPositions.get(sorted[0].id)!.x;
        const maxX = absPositions.get(sorted[sorted.length - 1].id)!.x;
        const step = (maxX - minX) / (sorted.length - 1);
        newAbsPositions = new Map(sorted.map((n, i) => [n.id, { x: minX + step * i, y: absPositions.get(n.id)!.y }]));
        break;
      }
      case 'distributeV': {
        const sorted = [...targets].sort((a, b) => absPositions.get(a.id)!.y - absPositions.get(b.id)!.y);
        const minY = absPositions.get(sorted[0].id)!.y;
        const maxY = absPositions.get(sorted[sorted.length - 1].id)!.y;
        const step = (maxY - minY) / (sorted.length - 1);
        newAbsPositions = new Map(sorted.map((n, i) => [n.id, { x: absPositions.get(n.id)!.x, y: minY + step * i }]));
        break;
      }
      default:
        return;
    }

    // Convert back to relative if parented
    set({
      nodes: nodes.map((n) => {
        const newAbs = newAbsPositions.get(n.id);
        if (!newAbs) return n;
        if (n.parentId) {
          const parent = nodes.find((p) => p.id === n.parentId);
          if (parent) return { ...n, position: { x: newAbs.x - parent.position.x, y: newAbs.y - parent.position.y } };
        }
        return { ...n, position: newAbs };
      }),
    });
  },

  tidyUpNodes: (nodeIds) => {
    const store = get();
    store.pushUndo();
    const nodes = store.nodes;
    const targets = nodes.filter((n) => nodeIds.includes(n.id) && n.type !== 'section');
    if (targets.length < 2) return;

    // Sort by Y then X
    const sorted = [...targets].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    const gap = 50;
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const startX = sorted[0].position.x;
    const startY = sorted[0].position.y;

    const posMap = new Map<string, { x: number; y: number }>();
    let curX = startX;
    let curY = startY;
    let rowH = 0;
    sorted.forEach((n, i) => {
      if (i > 0 && i % cols === 0) {
        curX = startX;
        curY += rowH + gap;
        rowH = 0;
      }
      posMap.set(n.id, { x: curX, y: curY });
      const w = n.measured?.width ?? (n.style?.width as number) ?? 200;
      const h = n.measured?.height ?? (n.style?.height as number) ?? 200;
      curX += w + gap;
      rowH = Math.max(rowH, h);
    });

    set({
      nodes: nodes.map((n) => {
        const p = posMap.get(n.id);
        return p ? { ...n, position: p } : n;
      }),
    });
  },

  wrapInSection: (nodeIds) => {
    const store = get();
    const nodes = store.nodes;
    const targets = nodes.filter((n) => nodeIds.includes(n.id) && n.type !== 'section' && !n.parentId);
    if (targets.length === 0) return;

    // Compute bounding box
    const pad = 60;
    const topPad = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of targets) {
      const w = n.measured?.width ?? (n.style?.width as number) ?? 200;
      const h = n.measured?.height ?? (n.style?.height as number) ?? 200;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    store.addSection(
      { x: minX - pad, y: minY - topPad },
      { width: maxX - minX + pad * 2, height: maxY - minY + topPad + pad },
    );
  },

  duplicateSection: (sectionId) => {
    const store = get();
    store.pushUndo();
    const section = store.nodes.find((n) => n.id === sectionId && n.type === 'section');
    if (!section) return;

    const newSectionId = generateId();
    const offset = 40;
    const children = store.nodes.filter((n) => n.parentId === sectionId);
    const idMap = new Map<string, string>();
    idMap.set(sectionId, newSectionId);
    for (const c of children) idMap.set(c.id, generateId());

    const newSection: Node = {
      ...section,
      id: newSectionId,
      position: { x: section.position.x + offset, y: section.position.y + offset },
      selected: false,
    };

    const newChildren = children.map((c) => ({
      ...c,
      id: idMap.get(c.id)!,
      parentId: newSectionId,
      selected: false,
    }));

    // Duplicate edges between cloned nodes
    const oldIds = new Set([sectionId, ...children.map((c) => c.id)]);
    const newEdges = store.edges
      .filter((e) => oldIds.has(e.source) && oldIds.has(e.target))
      .map((e) => ({
        ...e,
        id: generateId(),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
        sourceHandle: e.sourceHandle?.replace(e.source, idMap.get(e.source) ?? e.source) ?? null,
        targetHandle: e.targetHandle?.replace(e.target, idMap.get(e.target) ?? e.target) ?? null,
      }));

    // Sections before children for z-ordering
    const sections = store.nodes.filter((n) => n.type === 'section');
    const rest = store.nodes.filter((n) => n.type !== 'section');
    set({
      nodes: [...sections, newSection, ...rest, ...newChildren],
      edges: [...store.edges, ...newEdges],
    });
  },

  ungroupSection: (sectionId) => {
    const store = get();
    store.pushUndo();
    const section = store.nodes.find((n) => n.id === sectionId && n.type === 'section');
    if (!section) return;

    set({
      nodes: store.nodes
        .filter((n) => n.id !== sectionId)
        .map((n) => {
          if (n.parentId === sectionId) {
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: {
                x: n.position.x + section.position.x,
                y: n.position.y + section.position.y,
              },
            };
          }
          return n;
        }),
      edges: store.edges.filter((e) => e.source !== sectionId && e.target !== sectionId),
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
