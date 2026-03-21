import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { makeId } from '../lib/id';
import type {
  AppEdge,
  AppNode,
  CharacterImageData,
  MotionAiData,
  MotionVideoData,
  OutputImageData,
  OutputVideoData,
  ProductImageData,
  TextNoteData,
  TryOnData,
  WorkflowSnapshot,
} from '../types/workflow';

type WorkflowState = {
  nodes: AppNode[];
  edges: AppEdge[];
  selectedNodeId?: string;
  viewport: { x: number; y: number; zoom: number };
  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: OnConnect;
  reconnectExistingEdge: (oldEdge: AppEdge, connection: Connection) => void;
  setSelectedNodeId: (id?: string) => void;
  addTextNode: (position?: XYPosition) => void;
  addMotionAiNode: (position?: XYPosition) => void;
  addOutputNode: (position?: XYPosition) => void;
  addTryOnNode: (position?: XYPosition) => void;
  addOutputImageNode: (position?: XYPosition) => void;
  addProductImageNode: (position?: XYPosition) => void;
  addMediaNodeFromFile: (file: File, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, partial: Record<string, unknown>) => void;
  removeNode: (nodeId: string) => void;
  disconnectNode: (nodeId: string) => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  exportWorkflow: () => WorkflowSnapshot;
  importWorkflow: (snapshot: WorkflowSnapshot) => void;
};

export function isValidConnection(connection: Connection | AppEdge, nodes: AppNode[], edges: AppEdge[]) {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  console.log('[isValidConnection STORE]', {
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    sourceNodeType: sourceNode?.type,
    targetNodeType: targetNode?.type,
  });

  if (!sourceNode || !targetNode || !connection.sourceHandle || !connection.targetHandle) {
    console.log('[isValidConnection STORE] REJECTED: missing node or handle');
    return false;
  }

  // Prevent multiple edges to the same target handle
  const targetTaken = edges.some(
    (edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle && edge.id !== ('id' in connection ? connection.id : '')
  );
  if (targetTaken) {
    console.log('[isValidConnection STORE] REJECTED: target handle already taken');
    return false;
  }

  const sourceType = connection.sourceHandle.split(':')[0];
  const targetType = connection.targetHandle.split(':')[0];

  if (sourceType !== targetType) {
    console.log(`[isValidConnection STORE] REJECTED: type mismatch "${sourceType}" vs "${targetType}"`);
    return false;
  }

  // Nodes that output an image URL (can feed into image:in ports)
  const imageSourceTypes = ['characterImage', 'productImage', 'outputImage'];

  if (targetNode.type === 'motionAi') {
    // image:in (blue) ← any image source
    if (targetType === 'image') return imageSourceTypes.includes(sourceNode.type ?? '');
    // cover:in (orange) ← motionVideo only
    if (targetType === 'cover') return sourceNode.type === 'motionVideo';
    console.log(`[isValidConnection STORE] motionAi REJECTED: unsupported targetType "${targetType}"`);
    return false;
  }

  if (targetNode.type === 'outputVideo') {
    return sourceNode.type === 'motionAi' && targetType === 'result';
  }

  if (targetNode.type === 'outputImage') {
    // accepts result from tryOn or motionAi
    return (sourceNode.type === 'tryOn' || sourceNode.type === 'motionAi') && targetType === 'result';
  }

  if (targetNode.type === 'tryOn') {
    // image ports accept any image source
    if (targetType === 'image') return imageSourceTypes.includes(sourceNode.type ?? '');
    return false;
  }

  console.log('[isValidConnection STORE] REJECTED: no rule matched');
  return false;
}

const initialNodes: AppNode[] = [
  {
    id: 'text_demo',
    type: 'textNote',
    position: { x: 40, y: 40 },
    data: {
      label: 'Workflow note',
      content: 'Drop ảnh nhân vật + video motion vào canvas, nối vào Motion AI rồi bấm Run.',
    } satisfies TextNoteData,
  },
  {
    id: 'motion_demo',
    type: 'motionAi',
    position: { x: 560, y: 180 },
    data: {
      label: 'Motion AI',
      prompt: 'motion control, keep identity, natural face and mouth movement',
      model: 'motion-control-3.0',
      mode: 'pro',
      resolution: '720p',
      server_id: 'fast',
      status: 'idle',
    } satisfies MotionAiData,
  },
  {
    id: 'output_demo',
    type: 'outputVideo',
    position: { x: 980, y: 220 },
    data: {
      label: 'Output',
      message: 'Kết quả render sẽ hiện ở đây.',
    } satisfies OutputVideoData,
  },
];

const initialEdges: AppEdge[] = [
  {
    id: 'edge_motion_output',
    source: 'motion_demo',
    target: 'output_demo',
    sourceHandle: 'result:out',
    targetHandle: 'result:in',
    animated: true,
  },
];

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  viewport: { x: 0, y: 0, zoom: 0.9 },
  selectedNodeId: undefined,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    console.log('[onConnect FIRED]', connection);
    if (!isValidConnection(connection, get().nodes, get().edges)) return;

    set({
      edges: addEdge(
        {
          ...connection,
          id: makeId('edge'),
          animated: true,
        },
        get().edges,
      ),
    });

    // Auto-populate: if source already has a result, push it to the newly connected output node
    const sourceNode = get().nodes.find((n) => n.id === connection.source);
    const targetNode = get().nodes.find((n) => n.id === connection.target);
    if (
      sourceNode &&
      targetNode &&
      connection.sourceHandle?.startsWith('result:') &&
      'resultUrl' in sourceNode.data &&
      typeof sourceNode.data.resultUrl === 'string' &&
      sourceNode.data.resultUrl
    ) {
      get().updateNodeData(targetNode.id, {
        resultUrl: sourceNode.data.resultUrl,
        message: 'Kết quả từ ' + (sourceNode.data as { label?: string }).label,
      });
    }
  },

  reconnectExistingEdge: (oldEdge, connection) => {
    console.log('[reconnectExistingEdge]', {
      oldEdge: { id: oldEdge.id, source: oldEdge.source, target: oldEdge.target, sourceHandle: oldEdge.sourceHandle, targetHandle: oldEdge.targetHandle },
      connection,
    });

    // Build the candidate edge for validation — exclude the old edge from
    // the "target already taken" check so we don't reject ourselves.
    const edgesWithoutOld = get().edges.filter((e) => e.id !== oldEdge.id);

    if (!isValidConnection(connection, get().nodes, edgesWithoutOld)) {
      console.log('[reconnectExistingEdge] REJECTED by isValidConnection');
      return;
    }
    set({ edges: reconnectEdge(oldEdge, connection, get().edges) });
  },

  setSelectedNodeId: (selectedNodeId) => {
  if (get().selectedNodeId === selectedNodeId) return;
  set({ selectedNodeId });
},

  addTextNode: (position) => {
    const node: AppNode = {
      id: makeId('text'),
      type: 'textNote',
      position: position ?? { x: 100, y: 100 },
      data: { label: 'Text note', content: '' },
    };
    set({ nodes: [...get().nodes, node] });
  },

  addMotionAiNode: (position) => {
    const node: AppNode = {
      id: makeId('motion'),
      type: 'motionAi',
      position: position ?? { x: 400, y: 260 },
      data: {
        label: 'Motion AI',
        prompt: 'motion control',
        model: 'motion-control-3.0',
        mode: 'std',
        resolution: '720p',
        server_id: 'fast',
        status: 'idle',
      },
    };
    set({ nodes: [...get().nodes, node] });
  },

  addOutputNode: (position) => {
    const node: AppNode = {
      id: makeId('output'),
      type: 'outputVideo',
      position: position ?? { x: 900, y: 260 },
      data: { label: 'Output', message: 'Ready' } satisfies OutputVideoData,
    };
    set({ nodes: [...get().nodes, node] });
  },

  addTryOnNode: (position) => {
    const node: AppNode = {
      id: makeId('tryon'),
      type: 'tryOn',
      position: position ?? { x: 300, y: 260 },
      data: { label: 'Try-On AI', prompt: '', model: 'nano-banana-pro', aspect_ratio: '1:1', status: 'idle' } satisfies TryOnData,
    };
    set({ nodes: [...get().nodes, node] });
  },

  addOutputImageNode: (position) => {
    const node: AppNode = {
      id: makeId('outimg'),
      type: 'outputImage',
      position: position ?? { x: 700, y: 260 },
      data: { label: 'Output Image', message: 'Ready' } satisfies OutputImageData,
    };
    set({ nodes: [...get().nodes, node] });
  },

  addProductImageNode: (position) => {
    const node: AppNode = {
      id: makeId('product'),
      type: 'productImage',
      position: position ?? { x: 100, y: 360 },
      data: { label: 'Product Image' } satisfies ProductImageData,
    };
    set({ nodes: [...get().nodes, node] });
  },

  addMediaNodeFromFile: (file, position) => {
    const previewUrl = URL.createObjectURL(file);

    if (file.type.startsWith('image/')) {
      const node: AppNode = {
        id: makeId('char'),
        type: 'characterImage',
        position,
        data: {
          label: 'Character Image',
          previewUrl,
          fileName: file.name,
          localFile: file,
          uploadState: 'idle',
        } satisfies CharacterImageData,
      };
      set({ nodes: [...get().nodes, node] });
      return;
    }

    if (file.type.startsWith('video/')) {
      const node: AppNode = {
        id: makeId('video'),
        type: 'motionVideo',
        position,
        data: {
          label: 'Motion Video',
          previewUrl,
          fileName: file.name,
          localFile: file,
          uploadState: 'idle',
        } satisfies MotionVideoData,
      };
      set({ nodes: [...get().nodes, node] });
    }
  },

  updateNodeData: (nodeId, partial) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...partial } } : node,
      ),
    });
  },

  removeNode: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);
    if (node && 'previewUrl' in node.data && typeof node.data.previewUrl === 'string') {
      URL.revokeObjectURL(node.data.previewUrl);
    }

    set({
      nodes: get().nodes.filter((item) => item.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? undefined : get().selectedNodeId,
    });
  },

  disconnectNode: (nodeId) => {
    set({
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    });
  },

  setViewport: (viewport) => {
  const current = get().viewport;
  const same =
    current.x === viewport.x &&
    current.y === viewport.y &&
    current.zoom === viewport.zoom;

  if (same) return;
  set({ viewport });
},

  exportWorkflow: () => ({
    nodes: get().nodes.map((node) => ({
      ...node,
      data: 'localFile' in node.data ? { ...node.data, localFile: undefined } : node.data,
    })),
    edges: get().edges,
    viewport: get().viewport,
  }),

  importWorkflow: (snapshot) =>
    set({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      viewport: snapshot.viewport,
      selectedNodeId: undefined,
    }),
}));

export function findConnectedInput(nodeId: string, handleType: 'image' | 'video' | 'cover' | 'text' | 'product') {
  const { nodes, edges } = useWorkflowStore.getState();
  const edge = edges.find(
    (item) => item.target === nodeId && item.targetHandle?.startsWith(`${handleType}:`),
  );

  if (!edge) return undefined;
  return nodes.find((node) => node.id === edge.source);
}

export function findConnectedInputByHandle(nodeId: string, exactHandle: string) {
  const { nodes, edges } = useWorkflowStore.getState();
  const edge = edges.find((item) => item.target === nodeId && item.targetHandle === exactHandle);
  if (!edge) return undefined;
  return nodes.find((node) => node.id === edge.source);
}

export function pushResultToOutputs(motionNodeId: string, resultUrl: string) {
  const { edges, updateNodeData } = useWorkflowStore.getState();
  const outputEdges = edges.filter(
    (edge) => edge.source === motionNodeId && edge.sourceHandle?.startsWith('result:'),
  );

  outputEdges.forEach((edge) => {
    updateNodeData(edge.target, {
      resultUrl,
      message: 'Render completed',
    });
  });
}
