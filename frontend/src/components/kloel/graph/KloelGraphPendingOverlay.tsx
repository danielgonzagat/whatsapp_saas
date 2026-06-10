'use client';

import { getKloelGraphOverlayLabel } from './KloelGraph.routes';
import type { KloelGraphNode } from './KloelGraph.routes';
import { GRAPH_MONO, useGraphTheme } from './KloelGraphTheme';

export function KloelGraphPendingOverlay({ node }: { readonly node: KloelGraphNode }) {
  const { C } = useGraphTheme();
  const label = getKloelGraphOverlayLabel(node);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 32,
        color: C.text,
      }}
    >
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 2,
            borderRadius: 6,
            background: C.ember,
          }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: GRAPH_MONO,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: C.text,
          }}
        >
          Carregando {label}
        </p>
      </div>
    </div>
  );
}
