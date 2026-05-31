import { MarkerType, type Connection, type Edge, type Node } from 'reactflow';
import { colors } from '@/lib/design-tokens';
import { canvasPalette } from '@/lib/canvas-palette-tokens';

/** Maximum number of history snapshots retained for undo/redo. */
export const FLOW_HISTORY_LIMIT = 50;

/** Snap-to-grid step (x, y) used by ReactFlow drag operations. */
export const FLOW_SNAP_GRID: [number, number] = [15, 15];

/** Snapshot of nodes + edges used by the undo/redo stack. */
export interface FlowHistorySnapshot {
  /** Nodes captured at the snapshot moment. */
  nodes: Node[];
  /** Edges captured at the snapshot moment. */
  edges: Edge[];
}

/** Default data emitted when a fresh node is created via drop or seed. */
export type FlowNodeDefaultData = Record<string, unknown>;

const NODE_DEFAULT_DATA: Record<string, FlowNodeDefaultData> = {
  start: { label: 'Início', trigger: 'manual' },
  message: { label: 'Mensagem', message: '' },
  input: { label: 'Entrada', question: '', variableName: '', inputType: 'text' },
  condition: { label: 'Condição', condition: '', operator: 'equals', value: '' },
  delay: { label: 'Delay', delayType: 'seconds', delayValue: 5 },
  action: { label: 'Ação', actionType: 'tag', config: {} },
  ai: { label: 'KLOEL IA', aiRole: 'writer', prompt: '', temperature: 0.7, maxTokens: 500 },
  waitForReply: {
    label: 'Aguardar Resposta',
    timeoutValue: 30,
    timeoutUnit: 'minutes',
    fallbackMessage: '',
  },
  end: { label: 'Fim', endAction: 'complete' },
};

/** Return the default data payload for a node type. */
export function getDefaultData(type: string): FlowNodeDefaultData {
  return NODE_DEFAULT_DATA[type] ?? { label: type };
}

/** Build the default seed node when a brand new flow opens with no nodes. */
export function buildSeedStartNode(): Node {
  return {
    id: 'start-1',
    type: 'start',
    position: { x: 250, y: 50 },
    data: getDefaultData('start'),
  };
}

/** Build the seed node list given the current nodes, returning them unchanged when non-empty. */
export function ensureSeedNodes(currentNodes: Node[]): Node[] {
  return currentNodes.length === 0 ? [buildSeedStartNode()] : currentNodes;
}

/** Build a deterministic node id for a given type and timestamp. */
export function buildNodeId(type: string, now: number): string {
  return `${type}-${now}`;
}

/** Create a new node placed at the supplied flow-space position. */
export function createNodeAtPosition(
  type: string,
  position: { x: number; y: number },
  now: number,
): Node {
  return {
    id: buildNodeId(type, now),
    type,
    position,
    data: getDefaultData(type),
  };
}

/** Build an edge from a ReactFlow connection event using KLOEL defaults. */
export function buildEdgeFromConnection(connection: Connection): Edge {
  return {
    ...connection,
    id: `${connection.source ?? ''}-${connection.target ?? ''}`,
    source: connection.source ?? '',
    target: connection.target ?? '',
    type: 'smoothstep',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 2 },
  };
}

/** Apply a new data payload to the node with the supplied id. */
export function applyNodeDataUpdate(
  nodes: Node[],
  nodeId: string,
  newData: Record<string, unknown>,
): Node[] {
  return nodes.map((node) => (node.id === nodeId ? { ...node, data: newData } : node));
}

/** Drop the nodes flagged as selected. */
export function removeSelectedNodes(nodes: Node[]): Node[] {
  return nodes.filter((node) => !node.selected);
}

/** Drop edges that touched any of the deleted nodes. */
export function removeOrphanEdges(edges: Edge[], deletedNodes: Node[]): Edge[] {
  if (deletedNodes.length === 0) {
    return edges;
  }
  const deletedIds = new Set(deletedNodes.map((node) => node.id));
  return edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target));
}

/** Push a snapshot onto the bounded history stack, returning the new stack + index. */
export function pushHistorySnapshot(
  history: FlowHistorySnapshot[],
  historyIndex: number,
  snapshot: FlowHistorySnapshot,
  limit: number = FLOW_HISTORY_LIMIT,
): { history: FlowHistorySnapshot[]; historyIndex: number } {
  const truncated = history.slice(0, historyIndex + 1);
  truncated.push(snapshot);
  const bounded = truncated.slice(-limit);
  return { history: bounded, historyIndex: bounded.length - 1 };
}

/** Whether an undo step is available given the current history pointer. */
export function canUndo(historyIndex: number): boolean {
  return historyIndex > 0;
}

/** Whether a redo step is available given the current history pointer. */
export function canRedo(history: FlowHistorySnapshot[], historyIndex: number): boolean {
  return historyIndex < history.length - 1;
}

/** Return the snapshot pointed at by stepping the history index by `delta`. */
export function getHistorySnapshot(
  history: FlowHistorySnapshot[],
  historyIndex: number,
  delta: -1 | 1,
): FlowHistorySnapshot | null {
  const target = historyIndex + delta;
  if (target < 0 || target >= history.length) {
    return null;
  }
  return history[target] ?? null;
}

const NODE_COLOR_MAP: Record<string, string> = {
  start: 'var(--app-success)',
  message: colors.checkout.success,
  input: colors.semantic.info,
  condition: colors.semantic.warning,
  delay: colors.ember.primary,
  waitForReply: colors.semantic.purple,
  action: colors.semantic.purpleText,
  ai: canvasPalette.indigo,
  end: 'var(--app-error)',
};

/** Resolve the minimap color for a node, falling back to the muted text token. */
export function resolveNodeMinimapColor(node: Pick<Node, 'type'>): string {
  return NODE_COLOR_MAP[node.type ?? 'default'] ?? colors.text.muted;
}

/** Default edge configuration used by both new connections and ReactFlow defaultEdgeOptions. */
export const FLOW_DEFAULT_EDGE_OPTIONS = {
  type: 'smoothstep' as const,
  animated: true as const,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};
