'use client';
import { kloelT } from '@/lib/i18n/t';
import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
  type OnError,
  ReactFlowProvider,
  useStoreApi,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { FlowSidebar } from './FlowSidebar';
import { NodeProperties } from './NodeProperties';
import { nodeTypes } from './nodes';

import { Maximize, Play, Redo, Save, Trash2, Undo, ZoomIn, ZoomOut } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import {
  FLOW_DEFAULT_EDGE_OPTIONS,
  FLOW_SNAP_GRID,
  applyNodeDataUpdate,
  buildEdgeFromConnection,
  createNodeAtPosition,
  ensureSeedNodes,
  type FlowHistorySnapshot,
  getHistorySnapshot,
  pushHistorySnapshot,
  removeOrphanEdges,
  removeSelectedNodes,
  resolveNodeMinimapColor,
} from './FlowBuilder.helpers';

const FLOW_PRO_OPTIONS = { hideAttribution: true };
const FLOW_EDGE_TYPES = Object.freeze({});
const handleReactFlowError: OnError = (id, message) => {
  if (id === '002') {
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(`[React Flow]: ${message} Help: https://reactflow.dev/error#${id}`);
  }
};

function ReactFlowErrorBootstrap({ children }: { children: ReactNode }) {
  const store = useStoreApi();

  if (store.getState().onError !== handleReactFlowError) {
    store.setState({ onError: handleReactFlowError });
  }

  return <>{children}</>;
}


interface FlowBuilderProps {
  flowId?: string;
  workspaceId?: string;
  onSave?: (flow: { nodes: Node[]; edges: Edge[]; name: string }) => Promise<void>;
  onTest?: (flow: { nodes: Node[]; edges: Edge[]; name: string }) => void | Promise<void>;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  initialName?: string;
  readOnly?: boolean;
}

/** Flow builder. */
export default function FlowBuilder({
  flowId: _flowId,
  workspaceId: _workspaceId,
  onSave,
  onTest,
  initialNodes = [],
  initialEdges = [],
  initialName,
  readOnly = false,
}: FlowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const seededInitialNodes = useMemo(() => ensureSeedNodes(initialNodes), [initialNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(seededInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [flowName, setFlowName] = useState(initialName || 'Novo Fluxo');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<FlowHistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Create default start node if no nodes exist
  useEffect(() => {
    setNodes((currentNodes) => ensureSeedNodes(currentNodes));
  }, [setNodes]);

  // Save to history for undo/redo
  const saveToHistory = useCallback(() => {
    const next = pushHistorySnapshot(history, historyIndex, {
      nodes: [...nodes],
      edges: [...edges],
    });
    setHistory(next.history);
    setHistoryIndex(next.historyIndex);
  }, [nodes, edges, history, historyIndex]);

  // Handle node connection
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = buildEdgeFromConnection(connection);
      setEdges((eds) => addEdge(newEdge, eds));
      saveToHistory();
    },
    [setEdges, saveToHistory],
  );

  // Handle drag over
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop
  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) {
        return;
      }

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = createNodeAtPosition(type, position, Date.now());

      setNodes((nds) => [...nds, newNode]);
      saveToHistory();
    },
    [reactFlowInstance, setNodes, saveToHistory],
  );

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // Handle node update from properties panel
  const handleNodeUpdate = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) => applyNodeDataUpdate(nds, nodeId, newData));
      setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: newData } : prev));
    },
    [setNodes],
  );

  // Handle delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    const deletedNodes = nodes.filter((node) => node.selected);
    setNodes((nds) => removeSelectedNodes(nds));
    setEdges((eds) => removeOrphanEdges(eds, deletedNodes));
    setSelectedNode(null);
    saveToHistory();
  }, [nodes, setNodes, setEdges, saveToHistory]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!onSave) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await onSave({ nodes, edges, name: flowName });
      setSaveMessage(kloelT('Fluxo salvo'));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : kloelT('Erro ao salvar fluxo');
      setSaveError(message);
      setSaveMessage(null);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, flowName, onSave]);
  const handleTest = useCallback(async () => {
    if (!onTest) {
      return;
    }
    setIsTesting(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await onTest({ nodes, edges, name: flowName });
      setSaveMessage(kloelT('Teste executado'));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : kloelT('Erro ao testar fluxo');
      setSaveMessage(null);
      setSaveError(message);
    } finally {
      setIsTesting(false);
    }
  }, [nodes, edges, flowName, onTest]);



  // Undo
  const handleUndo = useCallback(() => {
    const prevState = getHistorySnapshot(history, historyIndex, -1);
    if (prevState) {
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Redo
  const handleRedo = useCallback(() => {
    const nextState = getHistorySnapshot(history, historyIndex, 1);
    if (nextState) {
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Fit view
  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  // Minimap node color
  const nodeColor = useCallback((node: Node) => resolveNodeMinimapColor(node), []);

  return (
    <div className="flex h-full w-full">
      {!readOnly && <FlowSidebar />}

      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlowProvider>
          <ReactFlowErrorBootstrap>
            <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={FLOW_EDGE_TYPES}
          onError={handleReactFlowError}
          fitView
          snapToGrid
          snapGrid={FLOW_SNAP_GRID}
          defaultEdgeOptions={FLOW_DEFAULT_EDGE_OPTIONS}
          proOptions={FLOW_PRO_OPTIONS}
        >
          <Background color={colors.text.dim} gap={15} />
          <Controls showInteractive={!readOnly} />
          <MiniMap nodeColor={nodeColor} nodeStrokeWidth={3} zoomable pannable />

          {/* Top toolbar */}
          <Panel
            position="top-center"
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex items-center gap-2"
          >
            <input
              id="flow-name"
              name="flow-name"
              aria-label={kloelT(`Nome do fluxo`)}
              type="text"
              value={flowName}
              onChange={(e) => {
                setFlowName(e.target.value);
                setSaveError(null);
                setSaveMessage(null);
              }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              placeholder={kloelT(`Nome do fluxo`)}
              readOnly={readOnly}
            />

            <div className="w-px h-6 bg-gray-200" />

            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0 || readOnly}
              className="p-1.5 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title={kloelT(`Desfazer`)}
            >
              <Undo className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1 || readOnly}
              className="p-1.5 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title={kloelT(`Refazer`)}
            >
              <Redo className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>

            <div className="w-px h-6 bg-gray-200" />

            <button
              type="button"
              onClick={() => reactFlowInstance?.zoomIn()}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title={kloelT(`Zoom in`)}
            >
              <ZoomIn className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => reactFlowInstance?.zoomOut()}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title={kloelT(`Zoom out`)}
            >
              <ZoomOut className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleFitView}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title={kloelT(`Ajustar visualização`)}
            >
              <Maximize className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>

            <div className="w-px h-6 bg-gray-200" />

            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedNode || readOnly}
              className="p-1.5 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title={kloelT(`Excluir selecionado`)}
            >
              <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
            </button>

            <div className="w-px h-6 bg-gray-200" />

            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />

                  {isTesting ? kloelT('Testando...') : kloelT('Testar')}
                </button>
                {saveMessage ? (
                  <span role="status" className="max-w-[180px] truncate rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700" title={saveMessage}>
                    {saveMessage}
                  </span>
                ) : null}
                {saveError ? (
                  <span role="alert" className="max-w-[260px] truncate rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700" title={saveError}>
                    {saveError}
                  </span>
                ) : null}
              </>
            )}
          </Panel>

          {/* Stats panel */}
          <Panel
            position="bottom-left"
            className="bg-white/90 rounded-lg shadow border border-gray-200 px-3 py-2 text-xs text-gray-600"
          >
            <div className="flex gap-4">
              <span>
                {nodes.length} {kloelT(`nós`)}
              </span>
              <span>
                {edges.length} {kloelT(`conexões`)}
              </span>
            </div>
          </Panel>
            </ReactFlow>
          </ReactFlowErrorBootstrap>
        </ReactFlowProvider>
      </div>

      {selectedNode && !readOnly && (
        <NodeProperties
          node={selectedNode}
          onUpdate={handleNodeUpdate}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
