"use client";

import { useCallback, useState, useRef, DragEvent, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { FlowSidebar } from './FlowSidebar';
import { NodeProperties } from './NodeProperties';
import { MessageNode } from './nodes/MessageNode';
import { ConditionNode } from './nodes/ConditionNode';
import { ActionNode } from './nodes/ActionNode';
import { InputNode } from './nodes/InputNode';
import { DelayNode } from './nodes/DelayNode';
import { AINode } from './nodes/AINode';
import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';

import { Save, Play, Trash2, Undo, Redo, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// Node type registry
const nodeTypes = {
  message: MessageNode,
  condition: ConditionNode,
  action: ActionNode,
  input: InputNode,
  delay: DelayNode,
  ai: AINode,
  start: StartNode,
  end: EndNode,
};

// Default data for each node type
const getDefaultData = (type: string) => {
  const defaults: Record<string, any> = {
    start: { label: 'Início', trigger: 'manual' },
    message: { label: 'Mensagem', message: '' },
    input: { label: 'Entrada', question: '', variableName: '', inputType: 'text' },
    condition: { label: 'Condição', condition: '', operator: 'equals', value: '' },
    delay: { label: 'Delay', delayType: 'seconds', delayValue: 5 },
    action: { label: 'Ação', actionType: 'tag', config: {} },
    ai: { label: 'KLOEL IA', model: 'gpt-4o', prompt: '', temperature: 0.7, maxTokens: 500 },
    end: { label: 'Fim', endAction: 'complete' },
  };
  return defaults[type] || { label: type };
};

interface FlowBuilderProps {
  flowId?: string;
  workspaceId?: string;
  onSave?: (flow: { nodes: Node[]; edges: Edge[]; name: string }) => Promise<void>;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  readOnly?: boolean;
}

export default function FlowBuilder({
  flowId,
  workspaceId,
  onSave,
  initialNodes = [],
  initialEdges = [],
  readOnly = false,
}: FlowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [flowName, setFlowName] = useState('Novo Fluxo');
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Create default start node if no nodes exist
  useEffect(() => {
    if (nodes.length === 0) {
      setNodes([
        {
          id: 'start-1',
          type: 'start',
          position: { x: 250, y: 50 },
          data: getDefaultData('start'),
        },
      ]);
    }
  }, []);

  // Save to history for undo/redo
  const saveToHistory = useCallback(() => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    setHistory(newHistory.slice(-50)); // Keep last 50 states
    setHistoryIndex(newHistory.length - 1);
  }, [nodes, edges, history, historyIndex]);

  // Handle node connection
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      saveToHistory();
    },
    [setEdges, saveToHistory]
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

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: getDefaultData(type),
      };

      setNodes((nds) => [...nds, newNode]);
      saveToHistory();
    },
    [reactFlowInstance, setNodes, saveToHistory]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  // Handle node update from properties panel
  const handleNodeUpdate = useCallback(
    (nodeId: string, newData: any) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: newData } : node
        )
      );
      setSelectedNode((prev) =>
        prev?.id === nodeId ? { ...prev, data: newData } : prev
      );
    },
    [setNodes]
  );

  // Handle delete selected nodes
  const handleDeleteSelected = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !nodes.find((n) => n.selected && (n.id === edge.source || n.id === edge.target))
      )
    );
    setSelectedNode(null);
    saveToHistory();
  }, [nodes, setNodes, setEdges, saveToHistory]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave({ nodes, edges, name: flowName });
    } catch (error) {
      console.error('Error saving flow:', error);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, flowName, onSave]);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
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
  const nodeColor = useCallback((node: Node) => {
    const colors: Record<string, string> = {
      start: '#10b981',
      message: '#22c55e',
      input: '#3b82f6',
      condition: '#eab308',
      delay: '#f97316',
      action: '#a855f7',
      ai: '#6366f1',
      end: '#ef4444',
    };
    return colors[node.type || 'default'] || '#94a3b8';
  }, []);

  return (
    <div className="flex h-full w-full">
      {!readOnly && <FlowSidebar />}
      
      <div className="flex-1 relative" ref={reactFlowWrapper}>
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
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={15} />
          <Controls showInteractive={!readOnly} />
          <MiniMap 
            nodeColor={nodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
          />

          {/* Top toolbar */}
          <Panel position="top-center" className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex items-center gap-2">
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              placeholder="Nome do fluxo"
              readOnly={readOnly}
            />
            
            <div className="w-px h-6 bg-gray-200" />
            
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0 || readOnly}
              className="p-1.5 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Desfazer"
            >
              <Undo className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1 || readOnly}
              className="p-1.5 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refazer"
            >
              <Redo className="w-4 h-4 text-gray-600" />
            </button>
            
            <div className="w-px h-6 bg-gray-200" />
            
            <button
              onClick={() => reactFlowInstance?.zoomIn()}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => reactFlowInstance?.zoomOut()}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={handleFitView}
              className="p-1.5 hover:bg-gray-100 rounded-md"
              title="Ajustar visualização"
            >
              <Maximize className="w-4 h-4 text-gray-600" />
            </button>
            
            <div className="w-px h-6 bg-gray-200" />
            
            <button
              onClick={handleDeleteSelected}
              disabled={!selectedNode || readOnly}
              className="p-1.5 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Excluir selecionado"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>

            <div className="w-px h-6 bg-gray-200" />

            {!readOnly && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-sm rounded-md hover:bg-green-600"
                >
                  <Play className="w-4 h-4" />
                  Testar
                </button>
              </>
            )}
          </Panel>

          {/* Stats panel */}
          <Panel position="bottom-left" className="bg-white/90 rounded-lg shadow border border-gray-200 px-3 py-2 text-xs text-gray-600">
            <div className="flex gap-4">
              <span>{nodes.length} nós</span>
              <span>{edges.length} conexões</span>
            </div>
          </Panel>
        </ReactFlow>
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
