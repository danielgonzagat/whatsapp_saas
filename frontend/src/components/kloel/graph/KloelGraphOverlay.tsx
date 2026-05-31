'use client';

import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';
import type { ReactNode } from 'react';

import { getKloelGraphOverlayLabel } from './KloelGraph.routes';
import type { KloelGraphNode } from './KloelGraph.routes';
import { GRAPH_MONO, useGraphTheme } from './KloelGraphTheme';

/**
 * The 80% overlay — faithful prototype port. The real route screen renders inside
 * a centered ~80vw×80vh panel with the live graph dimmed behind it. The shell is
 * intentionally "almost invisible": no header, no re-theming of the inner screen —
 * the panel surface uses the host app void so the real (themed) screen blends in,
 * and only a discreet close button sits on top. Contract preserved from #473:
 * role="dialog" named by the active node, plus the "Fechar overlay do grafo" button.
 */
export function KloelGraphOverlay({
  activeNode,
  children,
  onClose,
}: {
  readonly activeNode: KloelGraphNode | undefined;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const { C } = useGraphTheme();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.12)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        padding: 20,
      }}
    >
      <section
        aria-label={getKloelGraphOverlayLabel(activeNode)}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: '80vw',
          height: '80vh',
          maxWidth: 'min(1320px, calc(100vw - 24px))',
          maxHeight: 'min(900px, calc(100vh - 24px))',
          overflow: 'auto',
          border: `1px solid ${C.divider}`,
          borderRadius: 12,
          background: 'var(--bg-void, #0A0A0C)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.16)',
        }}
      >
        <button
          type="button"
          aria-label="Fechar overlay do grafo"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            zIndex: 2,
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: C.glass,
            color: C.muted,
            cursor: 'pointer',
            fontFamily: GRAPH_MONO,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <ErrorBoundary>{children}</ErrorBoundary>
      </section>
    </div>
  );
}
