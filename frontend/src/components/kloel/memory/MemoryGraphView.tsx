'use client';

import { useEffect, useState } from 'react';
import {
  KloelGraphLiteralCanvas,
  createDefaultKloelGraphSettings,
} from '@/components/kloel/graph/KloelGraphLiteralCanvas';
import type { KloelGraphNode } from '@/components/kloel/graph/KloelGraph.routes';
import type { GraphEdge } from '@/components/kloel/graph/KloelGraphShell.helpers';
import { getMemoryGraph, type MemoryGraphPayload } from '@/lib/api/memory-graph';

/**
 * The "Memória" node's screen — renders the authenticated user's per-user memory
 * as a subgraph through the SAME immutable Kloel Sigma/canvas renderer (no new
 * visual language: it reuses KloelGraphLiteralCanvas, its physics, and its
 * theme tokens). A central "Você" node links to one node per remembered aspect.
 * Data is read-time-derived from MindMemory by GET /kloel/memory/graph.
 */
function toGraphNodes(payload: MemoryGraphPayload): readonly KloelGraphNode[] {
  return payload.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    area: 'kloel',
    // Reuse the existing node visual vocabulary: the centre is a "core" mass,
    // preferences read as "metric", everything else as a plain "route" node.
    type: n.id === 'you' ? 'core' : n.group === 'preference' ? 'metric' : 'route',
    route: '/memoria',
    overlayLabel: n.label,
  }));
}

function toGraphEdges(payload: MemoryGraphPayload): readonly GraphEdge[] {
  return payload.edges.map((e) => ({ from: e.from, to: e.to, directed: true }));
}

function MemoryGraphState({
  role,
  children,
}: {
  readonly role: 'status' | 'alert';
  readonly children: string;
}) {
  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 32,
        fontSize: 15,
        lineHeight: 1.6,
        color: 'rgb(107,107,112)',
      }}
    >
      {children}
    </div>
  );
}

export function MemoryGraphView() {
  const [payload, setPayload] = useState<MemoryGraphPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [memoryTypeFilter, setMemoryTypeFilter] = useState('all');
  const [memoryStateFilter, setMemoryStateFilter] = useState('all');

  useEffect(() => {
    let active = true;
    void getMemoryGraph()
      .then((p) => {
        if (active) {
          setPayload(p);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) {
          setPayload(null);
          setStatus('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const graphPayload: MemoryGraphPayload = payload ?? { nodes: [], edges: [] };
  const selectedNode =
    graphPayload.nodes.find((node) => node.id === selectedNodeId && node.id !== 'you') ?? null;

  const settings = createDefaultKloelGraphSettings();
  const memoryTypeFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'fact', label: 'Fatos' },
    { value: 'preference', label: 'Preferências' },
    { value: 'project', label: 'Projetos' },
    { value: 'goal', label: 'Objetivos' },
    { value: 'decision', label: 'Decisões' },
    { value: 'entity', label: 'Entidades' },
    { value: 'document', label: 'Documentos' },
    { value: 'summary', label: 'Resumos' },
    { value: 'contradiction', label: 'Contradições' },
  ] as const;
  const memoryStateFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'confirmed', label: 'Confirmadas' },
    { value: 'uncertain', label: 'Incertas' },
    { value: 'pinned', label: 'Fixadas' },
    { value: 'sensitive', label: 'Sensíveis' },
    { value: 'blocked', label: 'Bloqueadas' },
    { value: 'archived', label: 'Arquivadas' },
    { value: 'contradicted', label: 'Contraditas' },
    { value: 'replaced', label: 'Substituídas' },
  ] as const;
  const memoryLimit = 60;
  const isCenterNode = (node: MemoryGraphPayload['nodes'][number]) =>
    node.id === 'you' || node.group === 'center';
  const rankMemoryNode = (node: MemoryGraphPayload['nodes'][number]) =>
    (node.pinned ? 1_000 : 0) + (node.importance ?? 0) * 100 + (node.confidence ?? 0) * 10;
  const matchesMemoryStateFilter = (node: MemoryGraphPayload['nodes'][number]) => {
    if (memoryStateFilter === 'all') {
      return true;
    }
    if (memoryStateFilter === 'pinned') {
      return node.pinned === true || node.state === 'pinned';
    }
    if (memoryStateFilter === 'sensitive') {
      return node.sensitive === true || node.state === 'sensitive';
    }
    if (memoryStateFilter === 'blocked') {
      return node.blockedForAgent === true || node.state === 'blocked';
    }
    if (memoryStateFilter === 'archived') {
      return node.archived === true || node.state === 'archived';
    }
    return (node.state ?? 'confirmed') === memoryStateFilter;
  };
  const centerNodes = graphPayload.nodes.filter(isCenterNode);
  const memoryNodes = graphPayload.nodes.filter((node) => !isCenterNode(node));
  const typeFilteredMemoryNodes =
    memoryTypeFilter === 'all'
      ? memoryNodes
      : memoryNodes.filter((node) => node.group === memoryTypeFilter);
  const filteredMemoryNodes = typeFilteredMemoryNodes.filter(matchesMemoryStateFilter);
  const visibleMemoryNodes = [...filteredMemoryNodes]
    .sort((left, right) => rankMemoryNode(right) - rankMemoryNode(left))
    .slice(0, memoryLimit);
  const visibleNodeIds = new Set([...centerNodes, ...visibleMemoryNodes].map((node) => node.id));
  const visibleGraphPayload: MemoryGraphPayload = {
    nodes: [...centerNodes, ...visibleMemoryNodes],
    edges: graphPayload.edges.filter(
      (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
    ),
  };

  const updateSelectedNode = async (patch: Parameters<(typeof import('@/lib/api/memory-graph'))['updateMemoryGraphNode']>[1]) => {
    if (!selectedNode) {
      return;
    }
    setActionStatus('saving');
    try {
      const { updateMemoryGraphNode } = await import('@/lib/api/memory-graph');
      const nextPayload = await updateMemoryGraphNode(selectedNode.id, patch);
      const nextSelectedNode = nextPayload.nodes.find((node) => node.id === selectedNode.id) ?? null;
      setPayload(nextPayload);
      if (patch.forgotten || !nextSelectedNode) {
        setSelectedNodeId(null);
        setDraftContent('');
        setDraftSummary('');
      } else {
        setSelectedNodeId(selectedNode.id);
        setDraftContent(nextSelectedNode.content ?? nextSelectedNode.label ?? '');
        setDraftSummary(nextSelectedNode.summary ?? nextSelectedNode.label ?? '');
      }
      setActionStatus('idle');
    } catch {
      setActionStatus('error');
    }
  };
  const controlStyle = {
    border: '1px solid rgba(148,163,184,.28)',
    background: 'rgba(15,23,42,.74)',
    color: 'rgb(229,231,235)',
    borderRadius: 8,
    padding: '9px 11px',
    fontSize: 12,
    cursor: actionStatus === 'saving' ? 'wait' : 'pointer',
  } as const;
  const filterControlStyle = {
    border: '1px solid rgba(148,163,184,.28)',
    background: 'rgba(15,23,42,.78)',
    color: 'rgb(229,231,235)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
  } as const;

  if (status === 'loading') {
    return <MemoryGraphState role="status">Carregando memória</MemoryGraphState>;
  }

  if (status === 'error') {
    return (
      <MemoryGraphState role="alert">Não foi possível carregar a memória do Kloel.</MemoryGraphState>
    );
  }

  if (payload && payload.nodes.length === 0) {
    return (
      <MemoryGraphState role="status">
        O Kloel ainda não aprendeu nada sobre você. Conforme você conversa, fatos e preferências que
        importam viram nós aqui.
      </MemoryGraphState>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        aria-label="Filtros da memória"
        style={{
          position: 'absolute',
          left: 18,
          top: 18,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          maxWidth: 'min(520px, calc(100% - 36px))',
          border: '1px solid rgba(148,163,184,.2)',
          borderRadius: 16,
          background: 'rgba(9,13,24,.82)',
          color: 'rgb(243,244,246)',
          boxShadow: '0 18px 58px rgba(0,0,0,.28)',
          padding: 12,
          backdropFilter: 'blur(18px)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          Tipo de memória
          <select
            value={memoryTypeFilter}
            onChange={(event) => setMemoryTypeFilter(event.target.value)}
            style={filterControlStyle}
          >
            {memoryTypeFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          Estado da memória
          <select
            value={memoryStateFilter}
            onChange={(event) => setMemoryStateFilter(event.target.value)}
            style={filterControlStyle}
          >
            {memoryStateFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite" style={{ color: 'rgb(203,213,225)', fontSize: 12 }}>
          {visibleMemoryNodes.length} de {filteredMemoryNodes.length} memórias visíveis
        </span>
        {filteredMemoryNodes.length !== memoryNodes.length ? (
          <span style={{ color: 'rgb(148,163,184)', fontSize: 12 }}>
            {memoryNodes.length} no grafo completo
          </span>
        ) : null}
      </div>
      <KloelGraphLiteralCanvas
        nodes={toGraphNodes(visibleGraphPayload)}
        edges={toGraphEdges(visibleGraphPayload)}
        activeNodeId={selectedNodeId ?? undefined}
        focusedArea="kloel"
        recenterNonce={0}
        settings={settings}
        onOpenNode={(node) => {
          if (node.id === 'you') {
            setSelectedNodeId(null);
            setDraftContent('');
            setDraftSummary('');
            return;
          }
          const memoryNode = graphPayload.nodes.find((candidate) => candidate.id === node.id);
          setSelectedNodeId(node.id);
          setDraftContent(memoryNode?.content ?? memoryNode?.label ?? '');
          setDraftSummary(memoryNode?.summary ?? memoryNode?.label ?? '');
        }}
        onClearSelection={() => setSelectedNodeId(null)}
      />
      {selectedNode ? (
        <aside
          aria-label="Editar memória"
          style={{
            position: 'absolute',
            right: 18,
            top: 18,
            width: 'min(360px, calc(100% - 36px))',
            maxHeight: 'calc(100% - 36px)',
            overflow: 'auto',
            border: '1px solid rgba(148,163,184,.22)',
            borderRadius: 16,
            background: 'rgba(9,13,24,.88)',
            color: 'rgb(243,244,246)',
            boxShadow: '0 24px 80px rgba(0,0,0,.38)',
            padding: 16,
            backdropFilter: 'blur(18px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgb(148,163,184)', textTransform: 'uppercase' }}>
                {selectedNode.group} · {selectedNode.state ?? 'confirmed'}
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: 18, lineHeight: 1.25 }}>{selectedNode.label}</h2>
            </div>
            <button type="button" style={controlStyle} onClick={() => setSelectedNodeId(null)}>
              Fechar
            </button>
          </div>
          <label style={{ display: 'block', marginTop: 14, fontSize: 12, color: 'rgb(203,213,225)' }}>
            Resumo
            <textarea
              value={draftSummary}
              onChange={(event) => setDraftSummary(event.target.value)}
              rows={2}
              style={{
                width: '100%',
                marginTop: 6,
                resize: 'vertical',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,.28)',
                background: 'rgba(15,23,42,.72)',
                color: 'inherit',
                padding: 10,
              }}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: 'rgb(203,213,225)' }}>
            Memória
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              rows={4}
              style={{
                width: '100%',
                marginTop: 6,
                resize: 'vertical',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,.28)',
                background: 'rgba(15,23,42,.72)',
                color: 'inherit',
                padding: 10,
              }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            <button type="button" style={controlStyle} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ summary: draftSummary, content: draftContent })}>
              Salvar texto
            </button>
            <button type="button" style={controlStyle} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ pinned: !selectedNode.pinned })}>
              {selectedNode.pinned ? 'Desfixar' : 'Fixar'}
            </button>
            <button type="button" style={controlStyle} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ sensitive: !selectedNode.sensitive })}>
              {selectedNode.sensitive ? 'Tirar sensível' : 'Sensível'}
            </button>
            <button type="button" style={controlStyle} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ blockedForAgent: !selectedNode.blockedForAgent })}>
              {selectedNode.blockedForAgent ? 'Permitir agente' : 'Bloquear agente'}
            </button>
            <button type="button" style={controlStyle} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ archived: !selectedNode.archived })}>
              {selectedNode.archived ? 'Desarquivar' : 'Arquivar'}
            </button>
            <button type="button" style={{ ...controlStyle, color: 'rgb(254,202,202)' }} disabled={actionStatus === 'saving'} onClick={() => updateSelectedNode({ forgotten: true })}>
              Esquecer
            </button>
          </div>
          {actionStatus === 'saving' ? (
            <p role="status" style={{ margin: '12px 0 0', color: 'rgb(148,163,184)', fontSize: 12 }}>
              Atualizando memória...
            </p>
          ) : null}
          {actionStatus === 'error' ? (
            <p role="alert" style={{ margin: '12px 0 0', color: 'rgb(254,202,202)', fontSize: 12 }}>
              Não foi possível atualizar esta memória.
            </p>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
