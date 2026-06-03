'use client';

import { KLOEL_GRAPH_PRIMARY_NODES } from './KloelGraph.routes';
import type { KloelGraphArea } from './KloelGraph.routes';
import { GRAPH_MONO, GRAPH_RADIUS, useGraphTheme } from './KloelGraphTheme';

/**
 * Floating top-center navigation pill — faithful prototype port. Glass capsule,
 * JetBrains Mono uppercase chips, ember fill on the focused galaxy. Selecting a
 * chip teleports the camera to that galaxy's sun (handled by the shell). The
 * trailing "Buscar" chip opens the existing command palette.
 */
export function KloelGraphFloatingNav({
  focusedArea,
  onFocusGalaxy,
  onSearch,
}: {
  readonly focusedArea: KloelGraphArea;
  readonly onFocusGalaxy: (area: KloelGraphArea) => void;
  readonly onSearch: () => void;
}) {
  const { C } = useGraphTheme();
  return (
    <nav
      aria-label="KloelGraph"
      style={{
        position: 'fixed',
        left: '50%',
        top: 16,
        zIndex: 50,
        display: 'flex',
        gap: 4,
        maxWidth: 'min(540px, calc(100vw - 80px))',
        overflowX: 'auto',
        transform: 'translateX(-50%)',
        border: `1px solid ${C.border}`,
        borderRadius: GRAPH_RADIUS.pill,
        background: C.glass,
        padding: 4,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04)',
        scrollbarWidth: 'none',
      }}
    >
      {KLOEL_GRAPH_PRIMARY_NODES.map((node) => {
        const focused = focusedArea === node.area;
        return (
          <button
            key={`nav-${node.id}`}
            type="button"
            onClick={() => onFocusGalaxy(node.area)}
            style={{
              border: 'none',
              borderRadius: GRAPH_RADIUS.pill,
              background: focused ? C.silver : 'transparent',
              color: focused ? C.void : C.muted,
              cursor: 'pointer',
              fontFamily: GRAPH_MONO,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              padding: '8px 16px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              transition: 'all .15s ease',
            }}
          >
            {node.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onSearch}
        aria-label="Buscar"
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: GRAPH_RADIUS.pill,
          background: 'transparent',
          color: C.muted,
          cursor: 'pointer',
          fontFamily: GRAPH_MONO,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          padding: '8px 14px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Buscar
      </button>
    </nav>
  );
}
