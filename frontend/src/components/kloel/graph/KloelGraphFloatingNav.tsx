'use client';

import { KLOEL_GRAPH_PRIMARY_NODES } from './KloelGraph.routes';
import type { KloelGraphArea } from './KloelGraph.routes';

export function KloelGraphFloatingNav({
  focusedArea,
  onFocusGalaxy,
  onSearch,
}: {
  readonly focusedArea: KloelGraphArea;
  readonly onFocusGalaxy: (area: KloelGraphArea) => void;
  readonly onSearch: () => void;
}) {
  return (
    <nav
      aria-label="KloelGraph"
      style={{
        position: 'absolute',
        left: '50%',
        top: 18,
        zIndex: 3,
        display: 'flex',
        gap: 6,
        maxWidth: 'calc(100vw - 24px)',
        overflowX: 'auto',
        transform: 'translateX(-50%)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6,
        background: 'rgba(13,13,16,0.76)',
        padding: 6,
        backdropFilter: 'blur(14px)',
      }}
    >
      {KLOEL_GRAPH_PRIMARY_NODES.map((node) => (
        <button
          key={`nav-${node.id}`}
          type="button"
          onClick={() => onFocusGalaxy(node.area)}
          style={{
            border: 'none',
            borderRadius: 6,
            background: focusedArea === node.area ? '#E85D30' : 'transparent',
            color: focusedArea === node.area ? '#FFFFFF' : '#E0DDD8',
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10,
            letterSpacing: 1,
            padding: '8px 11px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {node.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onSearch}
        style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          background: 'transparent',
          color: '#E0DDD8',
          cursor: 'pointer',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: 1,
          padding: '8px 11px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Buscar
      </button>
    </nav>
  );
}
