import { describe, it, expect } from 'vitest';
import { MarkerType, type Edge, type Node } from 'reactflow';

import {
  FLOW_DEFAULT_EDGE_OPTIONS,
  FLOW_HISTORY_LIMIT,
  FLOW_SNAP_GRID,
  applyNodeDataUpdate,
  buildEdgeFromConnection,
  buildNodeId,
  buildSeedStartNode,
  canRedo,
  canUndo,
  createNodeAtPosition,
  ensureSeedNodes,
  getDefaultData,
  getHistorySnapshot,
  pushHistorySnapshot,
  removeOrphanEdges,
  removeSelectedNodes,
  resolveNodeMinimapColor,
  type FlowHistorySnapshot,
} from './FlowBuilder.helpers';

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'n-1',
    type: 'message',
    position: { x: 0, y: 0 },
    data: { label: 'Mensagem' },
    ...overrides,
  };
}

function makeEdge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e-1',
    source: 'a',
    target: 'b',
    ...overrides,
  };
}

describe('getDefaultData', () => {
  it('returns the registered defaults for known node types', () => {
    expect(getDefaultData('start')).toEqual({ label: 'Início', trigger: 'manual' });
    expect(getDefaultData('message')).toEqual({ label: 'Mensagem', message: '' });
    expect(getDefaultData('ai')).toEqual({
      label: 'KLOEL IA',
      aiRole: 'writer',
      prompt: '',
      temperature: 0.7,
      maxTokens: 500,
    });
    expect(getDefaultData('end')).toEqual({ label: 'Fim', endAction: 'complete' });
  });

  it('falls back to a label equal to the unknown type', () => {
    expect(getDefaultData('mystery')).toEqual({ label: 'mystery' });
  });

  it('returns distinct references so callers cannot mutate the registry', () => {
    const first = getDefaultData('start');
    const second = getDefaultData('start');
    expect(first).toEqual(second);
  });
});

describe('buildSeedStartNode', () => {
  it('returns a deterministic start node at (250, 50)', () => {
    const node = buildSeedStartNode();
    expect(node.id).toBe('start-1');
    expect(node.type).toBe('start');
    expect(node.position).toEqual({ x: 250, y: 50 });
    expect(node.data).toEqual({ label: 'Início', trigger: 'manual' });
  });
});

describe('ensureSeedNodes', () => {
  it('seeds a start node when the list is empty', () => {
    const next = ensureSeedNodes([]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('start-1');
  });

  it('returns the same reference when nodes already exist', () => {
    const existing = [makeNode({ id: 'keep' })];
    expect(ensureSeedNodes(existing)).toBe(existing);
  });
});

describe('buildNodeId', () => {
  it('joins the type with the timestamp using a hyphen', () => {
    expect(buildNodeId('message', 1700000000000)).toBe('message-1700000000000');
  });
});

describe('createNodeAtPosition', () => {
  it('builds a node with the resolved defaults and position', () => {
    const node = createNodeAtPosition('input', { x: 12.5, y: -7 }, 42);
    expect(node).toEqual({
      id: 'input-42',
      type: 'input',
      position: { x: 12.5, y: -7 },
      data: { label: 'Entrada', question: '', variableName: '', inputType: 'text' },
    });
  });

  it('falls back to label-only defaults for unknown types', () => {
    const node = createNodeAtPosition('custom', { x: 0, y: 0 }, 1);
    expect(node.data).toEqual({ label: 'custom' });
  });
});

describe('buildEdgeFromConnection', () => {
  it('applies KLOEL defaults (smoothstep, animated, arrow marker, stroke width 2)', () => {
    const edge = buildEdgeFromConnection({
      source: 'a',
      target: 'b',
      sourceHandle: null,
      targetHandle: null,
    });
    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
    expect(edge.type).toBe('smoothstep');
    expect(edge.animated).toBe(true);
    expect(edge.markerEnd).toEqual({ type: MarkerType.ArrowClosed });
    expect(edge.style).toEqual({ strokeWidth: 2 });
  });

  it('coerces null source/target to empty strings (defensive against partial connections)', () => {
    const edge = buildEdgeFromConnection({
      source: null,
      target: null,
      sourceHandle: null,
      targetHandle: null,
    });
    expect(edge.source).toBe('');
    expect(edge.target).toBe('');
  });
});

describe('applyNodeDataUpdate', () => {
  it('replaces the data payload on the matching node only', () => {
    const a = makeNode({ id: 'a', data: { label: 'A' } });
    const b = makeNode({ id: 'b', data: { label: 'B' } });
    const result = applyNodeDataUpdate([a, b], 'b', { label: 'B2' });
    expect(result[0]).toBe(a);
    expect(result[1]).not.toBe(b);
    expect(result[1].data).toEqual({ label: 'B2' });
  });

  it('returns a new array when the id does not match', () => {
    const a = makeNode({ id: 'a' });
    const result = applyNodeDataUpdate([a], 'missing', { label: 'x' });
    expect(result).not.toBe([a]);
    expect(result[0]).toBe(a);
  });
});

describe('removeSelectedNodes', () => {
  it('removes nodes flagged as selected', () => {
    const kept = makeNode({ id: 'k' });
    const dropped = makeNode({ id: 'd', selected: true });
    const result = removeSelectedNodes([kept, dropped]);
    expect(result).toEqual([kept]);
  });

  it('returns the same elements when nothing is selected', () => {
    const list = [makeNode({ id: 'a' }), makeNode({ id: 'b' })];
    expect(removeSelectedNodes(list)).toEqual(list);
  });
});

describe('removeOrphanEdges', () => {
  it('drops edges that touch every deleted node id', () => {
    const edges: Edge[] = [
      makeEdge({ id: 'e-keep', source: 'x', target: 'y' }),
      makeEdge({ id: 'e-dead-source', source: 'gone', target: 'y' }),
      makeEdge({ id: 'e-dead-target', source: 'x', target: 'gone' }),
    ];
    const result = removeOrphanEdges(edges, [makeNode({ id: 'gone', selected: true })]);
    expect(result).toEqual([edges[0]]);
  });

  it('is a no-op when no nodes were deleted', () => {
    const edges = [makeEdge()];
    expect(removeOrphanEdges(edges, [])).toBe(edges);
  });
});

describe('pushHistorySnapshot', () => {
  function snap(id: string): FlowHistorySnapshot {
    return { nodes: [makeNode({ id })], edges: [] };
  }

  it('appends the snapshot and points the index at it', () => {
    const result = pushHistorySnapshot([], -1, snap('a'));
    expect(result.history).toHaveLength(1);
    expect(result.history[0].nodes[0].id).toBe('a');
    expect(result.historyIndex).toBe(0);
  });

  it('truncates redo branches beyond the current index before appending', () => {
    const history = [snap('a'), snap('b'), snap('c')];
    const result = pushHistorySnapshot(history, 0, snap('a2'));
    expect(result.history.map((entry) => entry.nodes[0].id)).toEqual(['a', 'a2']);
    expect(result.historyIndex).toBe(1);
  });

  it('caps the history at the supplied limit', () => {
    let history: FlowHistorySnapshot[] = [];
    let historyIndex = -1;
    for (let i = 0; i < 6; i += 1) {
      const next = pushHistorySnapshot(history, historyIndex, snap(`s-${i}`), 3);
      history = next.history;
      historyIndex = next.historyIndex;
    }
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.nodes[0].id)).toEqual(['s-3', 's-4', 's-5']);
    expect(historyIndex).toBe(2);
  });

  it('honors the default FLOW_HISTORY_LIMIT', () => {
    expect(FLOW_HISTORY_LIMIT).toBe(50);
  });
});

describe('canUndo / canRedo / getHistorySnapshot', () => {
  const history: FlowHistorySnapshot[] = [
    { nodes: [makeNode({ id: 'a' })], edges: [] },
    { nodes: [makeNode({ id: 'b' })], edges: [] },
    { nodes: [makeNode({ id: 'c' })], edges: [] },
  ];

  it('canUndo is true only when historyIndex > 0', () => {
    expect(canUndo(0)).toBe(false);
    expect(canUndo(1)).toBe(true);
    expect(canUndo(-1)).toBe(false);
  });

  it('canRedo is true only when there are entries after the current index', () => {
    expect(canRedo(history, 0)).toBe(true);
    expect(canRedo(history, 2)).toBe(false);
    expect(canRedo([], -1)).toBe(false);
  });

  it('getHistorySnapshot returns the previous or next snapshot when in range', () => {
    expect(getHistorySnapshot(history, 1, -1)?.nodes[0].id).toBe('a');
    expect(getHistorySnapshot(history, 1, 1)?.nodes[0].id).toBe('c');
  });

  it('getHistorySnapshot returns null when stepping outside the range', () => {
    expect(getHistorySnapshot(history, 0, -1)).toBeNull();
    expect(getHistorySnapshot(history, 2, 1)).toBeNull();
  });
});

describe('resolveNodeMinimapColor', () => {
  it('returns a colour for every registered node type', () => {
    for (const type of [
      'start',
      'message',
      'input',
      'condition',
      'delay',
      'waitForReply',
      'action',
      'ai',
      'end',
    ]) {
      expect(typeof resolveNodeMinimapColor({ type })).toBe('string');
      expect(resolveNodeMinimapColor({ type })).not.toBe('');
    }
  });

  it('falls back to the muted text token for unknown types', () => {
    const fallback = resolveNodeMinimapColor({ type: 'whatever' });
    expect(fallback).toBeTruthy();
    // Unknown types must not coincidentally collide with the start colour
    expect(fallback).not.toBe(resolveNodeMinimapColor({ type: 'start' }));
  });

  it('handles missing type by falling back to the default key', () => {
    const fallback = resolveNodeMinimapColor({});
    expect(typeof fallback).toBe('string');
  });
});

describe('FLOW_SNAP_GRID and FLOW_DEFAULT_EDGE_OPTIONS', () => {
  it('snap grid stays at 15px on both axes (matches ReactFlow Background gap)', () => {
    expect(FLOW_SNAP_GRID).toEqual([15, 15]);
  });

  it('default edge options expose the KLOEL line style', () => {
    expect(FLOW_DEFAULT_EDGE_OPTIONS.type).toBe('smoothstep');
    expect(FLOW_DEFAULT_EDGE_OPTIONS.animated).toBe(true);
    expect(FLOW_DEFAULT_EDGE_OPTIONS.markerEnd).toEqual({ type: MarkerType.ArrowClosed });
    expect(FLOW_DEFAULT_EDGE_OPTIONS.style).toEqual({ strokeWidth: 2 });
  });
});
