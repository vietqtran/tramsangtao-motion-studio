import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type XYPosition,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { CharacterImageNode } from './components/nodes/CharacterImageNode';
import { MotionAiNode } from './components/nodes/MotionAiNode';
import { MotionVideoNode } from './components/nodes/MotionVideoNode';
import { OutputImageNode } from './components/nodes/OutputImageNode';
import { OutputVideoNode } from './components/nodes/OutputVideoNode';
import { TextNoteNode } from './components/nodes/TextNoteNode';
import { ProductImageNode } from './components/nodes/ProductImageNode';
import { TryOnNode } from './components/nodes/TryOnNode';
import { QuotaPanel } from './components/QuotaPanel';
import { isValidConnection, useWorkflowStore } from './store/workflowStore';
import { makeId } from './lib/id';
import type { AppEdge, AppNode, WorkflowSnapshot } from './types/workflow';

// Define nodeTypes outside component to avoid recreating it on every render
const nodeTypes = {
  textNote: TextNoteNode,
  characterImage: CharacterImageNode,
  motionVideo: MotionVideoNode,
  motionAi: MotionAiNode,
  outputVideo: OutputVideoNode,
  tryOn: TryOnNode,
  outputImage: OutputImageNode,
  productImage: ProductImageNode,
} as const;

function FlowApp() {
  const reactFlowRef = useRef<ReactFlowInstance<AppNode, AppEdge> | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const importPickerRef = useRef<HTMLInputElement | null>(null);
  const canvasShellRef = useRef<HTMLElement | null>(null);
  const clipboardRef = useRef<{ nodes: AppNode[]; edges: AppEdge[]; center: XYPosition } | null>(null);
  const pasteCountRef = useRef(0);
  const dragCloneSourceIdsRef = useRef<string[] | null>(null);
  const historyRef = useRef<WorkflowSnapshot[]>([]);
  const redoHistoryRef = useRef<WorkflowSnapshot[]>([]);
  const lastSnapshotRef = useRef<WorkflowSnapshot | null>(null);
  const restoringRef = useRef(false);

  // Right-click marquee state
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeStartFlowRef = useRef<XYPosition>({ x: 0, y: 0 });

  const {
    nodes,
    edges,
    selectedNodeId,
    viewport,
    onNodesChange,
    onEdgesChange,
    onConnect,
    reconnectExistingEdge,
    setSelectedNodeId,
    addTextNode,
    addMotionAiNode,
    addOutputNode,
    addTryOnNode,
    addOutputImageNode,
    addProductImageNode,
    addMediaNodeFromFile,
    disconnectNode,
    removeNode,
    exportWorkflow,
    importWorkflow,
    setViewport,
  } = useWorkflowStore();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const defaultEdgeOptions = useMemo(() => ({ animated: true }), []);
  const selectedNodes = useMemo(() => {
    const byFlag = nodes.filter((node) => node.selected);
    if (byFlag.length > 0) return byFlag;
    if (!selectedNodeId) return [];
    const one = nodes.find((node) => node.id === selectedNodeId);
    return one ? [one] : [];
  }, [nodes, selectedNodeId]);

  const getViewportCenter = useCallback((index = 0): XYPosition => {
    if (!reactFlowRef.current || !canvasShellRef.current) {
      return { x: 160 + index * 40, y: 160 + index * 40 };
    }

    const rect = canvasShellRef.current.getBoundingClientRect();
    const center = reactFlowRef.current.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    return {
      x: center.x + index * 40,
      y: center.y + index * 40,
    };
  }, []);

  const duplicateNodes = useCallback(
    (sourceNodes: AppNode[], offset: XYPosition) => {
      if (!sourceNodes.length) return;
      const sourceIds = new Set(sourceNodes.map((node) => node.id));
      const edgesToClone = edges.filter(
        (edge) => sourceIds.has(edge.source) && sourceIds.has(edge.target),
      );
      const idMap = new Map<string, string>();
      sourceNodes.forEach((node) => idMap.set(node.id, makeId(node.type)));

      const clonedNodes = sourceNodes.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        selected: true,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      }));

      const clonedEdges = edgesToClone.map((edge) => ({
        ...edge,
        id: makeId('edge'),
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: false,
      }));

      importWorkflow({
        nodes: [...nodes.map((node) => ({ ...node, selected: false })), ...clonedNodes],
        edges: [...edges.map((edge) => ({ ...edge, selected: false })), ...clonedEdges],
        viewport,
      });
      setSelectedNodeId(clonedNodes[0]?.id);
    },
    [edges, importWorkflow, nodes, setSelectedNodeId, viewport],
  );

  const copySelection = useCallback(() => {
    if (!selectedNodes.length) return false;
    const sourceIds = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = edges.filter(
      (edge) => sourceIds.has(edge.source) && sourceIds.has(edge.target),
    );
    const minX = Math.min(...selectedNodes.map((node) => node.position.x));
    const maxX = Math.max(...selectedNodes.map((node) => node.position.x));
    const minY = Math.min(...selectedNodes.map((node) => node.position.y));
    const maxY = Math.max(...selectedNodes.map((node) => node.position.y));

    clipboardRef.current = {
      nodes: selectedNodes.map((node) => ({ ...node, selected: false })),
      edges: selectedEdges.map((edge) => ({ ...edge, selected: false })),
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    };
    pasteCountRef.current = 0;
    // Write a marker into the system clipboard so the paste handler can
    // tell whether the user has since overwritten it (e.g. via Win+V).
    navigator.clipboard.writeText('__motion_studio_nodes__').catch(() => {});
    return true;
  }, [edges, selectedNodes]);

  // Cut: delete selected nodes AND/OR independently selected edges
  const cutSelection = useCallback(() => {
    const selectedEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;

    // Copy nodes to clipboard (if any)
    if (selectedNodes.length > 0) copySelection();

    importWorkflow({
      nodes: nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: edges.filter(
        (e) =>
          !selectedEdgeIds.has(e.id) &&
          !selectedNodeIds.has(e.source) &&
          !selectedNodeIds.has(e.target),
      ),
      viewport,
    });
    setSelectedNodeId(undefined);
  }, [copySelection, edges, importWorkflow, nodes, selectedNodes, setSelectedNodeId, viewport]);

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current) return;
    const step = pasteCountRef.current + 1;
    pasteCountRef.current = step;
    const pivot = getViewportCenter();
    const { center, nodes: copiedNodes, edges: copiedEdges } = clipboardRef.current;
    const sourceToNewId = new Map<string, string>();
    copiedNodes.forEach((node) => sourceToNewId.set(node.id, makeId(node.type)));
    const drift = 24 * step;

    const newNodes = copiedNodes.map((node) => ({
      ...node,
      id: sourceToNewId.get(node.id)!,
      selected: true,
      position: {
        x: pivot.x + (node.position.x - center.x) + drift,
        y: pivot.y + (node.position.y - center.y) + drift,
      },
    }));
    const newEdges = copiedEdges.map((edge) => ({
      ...edge,
      id: makeId('edge'),
      source: sourceToNewId.get(edge.source)!,
      target: sourceToNewId.get(edge.target)!,
      selected: false,
    }));

    importWorkflow({
      nodes: [...nodes.map((node) => ({ ...node, selected: false })), ...newNodes],
      edges: [...edges.map((edge) => ({ ...edge, selected: false })), ...newEdges],
      viewport,
    });
    setSelectedNodeId(newNodes[0]?.id);
  }, [edges, getViewportCenter, importWorkflow, nodes, setSelectedNodeId, viewport]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      // Skip if user is typing in an input/textarea
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) return;

      const items = Array.from(event.clipboardData?.items ?? []);
      const hasImages = items.some((item) => item.type.startsWith('image/'));

      // Check if the system clipboard still has our marker (meaning the
      // user hasn't picked something else via Win+V or copied elsewhere).
      const clipText = event.clipboardData?.getData('text/plain') ?? '';
      const hasMarker = clipText === '__motion_studio_nodes__';

      // Marker present + we have internal nodes → paste nodes
      if (hasMarker && clipboardRef.current && clipboardRef.current.nodes.length > 0) {
        event.preventDefault();
        pasteClipboard();
        return;
      }

      // System clipboard has image(s) → create image node(s)
      if (hasImages) {
        event.preventDefault();
        const imageItems = items.filter((item) => item.type.startsWith('image/'));
        imageItems.forEach((item, index) => {
          const file = item.getAsFile();
          if (!file) return;
          const pos = getViewportCenter(index);
          addMediaNodeFromFile(file, pos);
        });
        return;
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addMediaNodeFromFile, getViewportCenter, pasteClipboard]);

  useEffect(() => {
    const snapshot: WorkflowSnapshot = { nodes, edges, viewport };
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot;
      return;
    }

    if (restoringRef.current) {
      restoringRef.current = false;
      lastSnapshotRef.current = snapshot;
      return;
    }

    historyRef.current.push(lastSnapshotRef.current);
    if (historyRef.current.length > 120) historyRef.current.shift();
    redoHistoryRef.current = []; // any new change clears the redo stack
    lastSnapshotRef.current = snapshot;
  }, [edges, nodes, viewport]);

  useEffect(() => {
    function isTypingElement(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      // Delete / Backspace: delete selected edges (when no text field focused)
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTypingElement(event.target)) {
        const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
        const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedEdgeIds.length > 0 || selectedNodeIds.length > 0) {
          onEdgesChange(selectedEdgeIds.map((id) => ({ type: 'remove' as const, id })));
          selectedNodeIds.forEach((id) => removeNode(id));
          event.preventDefault();
        }
        return;
      }

      if (!(event.ctrlKey || event.metaKey) || isTypingElement(event.target)) return;
      const key = event.key.toLowerCase();

      if (key === 'c') {
        if (copySelection()) event.preventDefault();
        return;
      }

      if (key === 'x') {
        cutSelection();
        event.preventDefault();
        return;
      }

      // Ctrl+V is handled entirely in the 'paste' event listener so we
      // can inspect clipboardData for images vs internal node clipboard.
      if (key === 'v') return;

      if (key === 'z') {
        const previous = historyRef.current.pop();
        if (!previous) return;
        if (lastSnapshotRef.current) redoHistoryRef.current.push(lastSnapshotRef.current);
        restoringRef.current = true;
        importWorkflow(previous);
        setSelectedNodeId(undefined);
        event.preventDefault();
        return;
      }

      if (key === 'y') {
        const next = redoHistoryRef.current.pop();
        if (!next) return;
        if (lastSnapshotRef.current) {
          historyRef.current.push(lastSnapshotRef.current);
          if (historyRef.current.length > 120) historyRef.current.shift();
        }
        restoringRef.current = true;
        importWorkflow(next);
        setSelectedNodeId(undefined);
        event.preventDefault();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelection, cutSelection, edges, importWorkflow, nodes, onEdgesChange, pasteClipboard, removeNode, setSelectedNodeId]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files || []);
      if (!files.length || !reactFlowRef.current) return;

      const position = reactFlowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      files.forEach((file, index) => {
        addMediaNodeFromFile(file, {
          x: position.x + index * 40,
          y: position.y + index * 40,
        });
      });
    },
    [addMediaNodeFromFile]
  );

  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: AppNode) => {
      if (!event.ctrlKey) {
        dragCloneSourceIdsRef.current = null;
        return;
      }

      const currentSelection = nodes.filter((item) => item.selected);
      if (currentSelection.length > 1 && currentSelection.some((item) => item.id === node.id)) {
        dragCloneSourceIdsRef.current = currentSelection.map((item) => item.id);
        return;
      }

      dragCloneSourceIdsRef.current = [node.id];
    },
    [nodes],
  );

  const onNodeDragStop = useCallback(() => {
    const sourceIds = dragCloneSourceIdsRef.current;
    dragCloneSourceIdsRef.current = null;
    if (!sourceIds || sourceIds.length === 0) return;
    const sourceNodes = nodes.filter((node) => sourceIds.includes(node.id));
    duplicateNodes(sourceNodes, { x: 40, y: 40 });
  }, [duplicateNodes, nodes]);

  // ── Right-click marquee handlers ──────────────────────────────────────
  const handleMarqueeStart = useCallback((event: React.MouseEvent) => {
    if (event.button !== 2) return; // right-click only
    event.stopPropagation();
    const shell = canvasShellRef.current;
    const instance = reactFlowRef.current;
    if (!shell || !instance) return;

    const rect = shell.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    marqueeActiveRef.current = true;
    marqueeStartFlowRef.current = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setMarquee({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  const handleMarqueeMove = useCallback((event: React.MouseEvent) => {
    if (!marqueeActiveRef.current) return;
    const shell = canvasShellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    setMarquee((prev) =>
      prev ? { ...prev, endX: event.clientX - rect.left, endY: event.clientY - rect.top } : null,
    );
  }, []);

  const handleMarqueeEnd = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 2 || !marqueeActiveRef.current) return;
      marqueeActiveRef.current = false;

      const instance = reactFlowRef.current;
      if (!instance) {
        setMarquee(null);
        return;
      }

      const flowStart = marqueeStartFlowRef.current;
      const flowEnd = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const minX = Math.min(flowStart.x, flowEnd.x);
      const maxX = Math.max(flowStart.x, flowEnd.x);
      const minY = Math.min(flowStart.y, flowEnd.y);
      const maxY = Math.max(flowStart.y, flowEnd.y);

      // Ignore tiny drags (likely just a right-click, not a marquee)
      if (Math.abs(maxX - minX) < 5 && Math.abs(maxY - minY) < 5) {
        // Deselect everything on plain right-click on empty space
        onNodesChange(nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
        onEdgesChange(edges.map((e) => ({ type: 'select' as const, id: e.id, selected: false })));
        setMarquee(null);
        return;
      }

      // Select nodes whose bounding box intersects the marquee (partial mode)
      const nodeChanges = nodes.map((node) => {
        const w = node.measured?.width ?? 300;
        const h = node.measured?.height ?? 120;
        const nx = node.position.x;
        const ny = node.position.y;
        const intersects = nx + w > minX && nx < maxX && ny + h > minY && ny < maxY;
        return { type: 'select' as const, id: node.id, selected: intersects };
      });
      onNodesChange(nodeChanges);

      // Select edges: endpoint node in selection, OR edge line segment
      // intersects the marquee rectangle.
      const selectedNodeIds = new Set(nodeChanges.filter((c) => c.selected).map((c) => c.id));
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Liang-Barsky line-rect intersection test
      function lineIntersectsRect(
        x1: number, y1: number, x2: number, y2: number,
        rxMin: number, ryMin: number, rxMax: number, ryMax: number,
      ): boolean {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const p = [-dx, dx, -dy, dy];
        const q = [x1 - rxMin, rxMax - x1, y1 - ryMin, ryMax - y1];
        let u0 = 0, u1 = 1;
        for (let i = 0; i < 4; i++) {
          if (p[i] === 0) { if (q[i] < 0) return false; }
          else {
            const t = q[i] / p[i];
            if (p[i] < 0) { if (t > u1) return false; u0 = Math.max(u0, t); }
            else { if (t < u0) return false; u1 = Math.min(u1, t); }
          }
        }
        return u0 <= u1;
      }

      const edgeChanges = edges.map((edge) => {
        const endpointHit = selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
        // Check if the edge line crosses the marquee box
        const srcNode = nodeMap.get(edge.source);
        const tgtNode = nodeMap.get(edge.target);
        let lineHit = false;
        if (srcNode && tgtNode) {
          const sw = srcNode.measured?.width ?? 300;
          const sh = srcNode.measured?.height ?? 120;
          const tw = tgtNode.measured?.width ?? 300;
          const th = tgtNode.measured?.height ?? 120;
          // Approximate edge endpoints: right-center of source, left-center of target
          const sx = srcNode.position.x + sw;
          const sy = srcNode.position.y + sh / 2;
          const tx = tgtNode.position.x;
          const ty = tgtNode.position.y + th / 2;
          lineHit = lineIntersectsRect(sx, sy, tx, ty, minX, minY, maxX, maxY);
        }
        return { type: 'select' as const, id: edge.id, selected: endpointHit || lineHit };
      });
      onEdgesChange(edgeChanges);

      if (selectedNodeIds.size > 0) setSelectedNodeId([...selectedNodeIds][0]);
      setMarquee(null);
    },
    [edges, nodes, onEdgesChange, onNodesChange, setSelectedNodeId],
  );

  // ── File I/O ──────────────────────────────────────────────────────────
  const saveJson = useCallback(() => {
    const snapshot = exportWorkflow();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'workflow.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exportWorkflow]);

  const loadJson = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const snapshot = JSON.parse(text);
    importWorkflow(snapshot);
  };

  // ── Marquee overlay rect (screen coords) ──────────────────────────────
  const marqueeStyle = marquee
    ? {
        position: 'absolute' as const,
        left: Math.min(marquee.startX, marquee.endX),
        top: Math.min(marquee.startY, marquee.endY),
        width: Math.abs(marquee.endX - marquee.startX),
        height: Math.abs(marquee.endY - marquee.startY),
        pointerEvents: 'none' as const,
        zIndex: 999,
        background: 'rgba(59,130,246,0.12)',
        border: '1.5px solid rgba(59,130,246,0.5)',
        borderRadius: 3,
      }
    : undefined;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">Motion Studio</div>
        <div className="toolbar-actions">
          <button className="ghost-btn" onClick={() => addTextNode(getViewportCenter())}>
            <Plus size={13} /> Text
          </button>
          <button className="ghost-btn" onClick={() => addMotionAiNode(getViewportCenter())}>
            <Plus size={13} /> Motion AI
          </button>
          <button className="ghost-btn" onClick={() => addOutputNode(getViewportCenter())}>
            <Plus size={13} /> Output
          </button>
          <button className="ghost-btn" onClick={() => addTryOnNode(getViewportCenter())}>
            <Plus size={13} /> Try-On AI
          </button>
          <button className="ghost-btn" onClick={() => addProductImageNode(getViewportCenter())}>
            <Plus size={13} /> Product
          </button>
          <button className="ghost-btn" onClick={() => addOutputImageNode(getViewportCenter())}>
            <Plus size={13} /> Output Img
          </button>
          <button className="ghost-btn" onClick={() => filePickerRef.current?.click()}>
            <FileUp size={13} /> Media
          </button>
          <button className="ghost-btn" onClick={saveJson}>
            <Save size={13} /> Save
          </button>
          <button className="ghost-btn" onClick={() => importPickerRef.current?.click()}>
            <Download size={13} /> Load
          </button>
          {selectedNodeId ? (
            <button className="danger-btn" onClick={() => removeNode(selectedNodeId)}>
              <Trash2 size={13} /> Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="workspace">
        <aside className="sidebar">
          <QuotaPanel />
          <h3>Hướng dẫn nhanh</h3>
          <p>1. Drop image/video vào canvas</p>
          <p>2. Upload từng node media</p>
          <p>3. Nối image + video vào Motion AI</p>
          <p>4. Nối Motion AI sang Output</p>
          <p>5. Nhấn Run Motion</p>

          <h3>Node đang chọn</h3>
          {selectedNode ? (
            <div className="inspector-card">
              <div>
                <strong>{selectedNode.type}</strong>
              </div>
              <pre>{JSON.stringify(selectedNode.data, null, 2)}</pre>
            </div>
          ) : (
            <p>Chọn node để xem chi tiết.</p>
          )}
        </aside>

        <main
          ref={canvasShellRef}
          className="canvas-shell"
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          onMouseDown={handleMarqueeStart}
          onMouseMove={handleMarqueeMove}
          onMouseUp={handleMarqueeEnd}
          onContextMenu={(event) => event.preventDefault()}
        >
          <ReactFlow<AppNode, AppEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes as any}
            style={{ width: '100%', height: '100%' }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={(oldEdge, connection) => reconnectExistingEdge(oldEdge as AppEdge, connection as Connection)}
            isValidConnection={(c) => isValidConnection(c, nodes, edges)}
            onNodeClick={(event, node) => {
              if (event.altKey) {
                disconnectNode(node.id);
              }
              setSelectedNodeId(node.id);
            }}
            onEdgeClick={(_, edge) => {
              // Toggle edge selection on click
              onEdgesChange([{ type: 'select', id: edge.id, selected: !edge.selected }]);
            }}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onInit={(instance) => {
              reactFlowRef.current = instance;
              instance.setViewport(viewport);
            }}
            onSelectionChange={({ nodes: selected }) => {
              setSelectedNodeId(selected[0]?.id);
            }}
            onMoveEnd={(_, nextViewport) => {
              setViewport(nextViewport);
            }}
            multiSelectionKeyCode="Control"
            panOnDrag={[0, 1]}
            edgesReconnectable
            connectionRadius={40}
            minZoom={0.05}
            maxZoom={4}
            snapToGrid
            snapGrid={[20, 20]}
            defaultEdgeOptions={defaultEdgeOptions}
            elevateEdgesOnSelect
            elementsSelectable
            edgesFocusable
          >
            <Panel position="top-left" className="panel-tip">
              Drop media vào canvas &middot; LMB: pan &middot; RMB: marquee select
            </Panel>
            <MiniMap pannable zoomable />
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          </ReactFlow>
          {marqueeStyle && <div style={marqueeStyle} />}
        </main>
      </div>

      <input
        ref={filePickerRef}
        className="hidden-input"
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          files.forEach((file, index) =>
            addMediaNodeFromFile(file, {
              x: getViewportCenter(index).x,
              y: getViewportCenter(index).y,
            })
          );
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={importPickerRef}
        className="hidden-input"
        type="file"
        accept="application/json"
        onChange={(event) => loadJson(event.target.files?.[0])}
      />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowApp />
    </ReactFlowProvider>
  );
}
