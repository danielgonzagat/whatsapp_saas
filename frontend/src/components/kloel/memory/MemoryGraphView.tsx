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

export function MemoryGraphView() {
  const [payload, setPayload] = useState<MemoryGraphPayload | null>(null);

  useEffect(() => {
    let active = true;
    void getMemoryGraph().then((p) => {
      if (active) {
        setPayload(p);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const settings = createDefaultKloelGraphSettings();

  if (payload && payload.nodes.length === 0) {
    return (
      <div
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
        O Kloel ainda não aprendeu nada sobre você. Conforme você conversa, fatos e preferências que
        importam viram nós aqui.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <KloelGraphLiteralCanvas
        nodes={toGraphNodes(payload ?? { nodes: [], edges: [] })}
        edges={toGraphEdges(payload ?? { nodes: [], edges: [] })}
        focusedArea="kloel"
        recenterNonce={0}
        settings={settings}
        onOpenNode={() => {}}
        onClearSelection={() => {}}
      />
    </div>
  );
}
