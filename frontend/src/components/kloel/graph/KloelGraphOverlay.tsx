'use client';

import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';
import type { ReactNode } from 'react';

import { getKloelGraphOverlayLabel } from './KloelGraph.routes';
import type { KloelGraphNode } from './KloelGraph.routes';

export function KloelGraphOverlay({
  activeNode,
  children,
  onClose,
}: {
  readonly activeNode: KloelGraphNode | undefined;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.16)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <section
        aria-label={getKloelGraphOverlayLabel(activeNode)}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: 'clamp(320px, 80vw, 1320px)',
          height: 'clamp(520px, 80vh, 900px)',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'calc(100vh - 24px)',
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          background: '#F5F5F5',
          color: '#1A1A1A',
          boxShadow: '0 24px 80px rgba(0,0,0,0.34)',
        }}
      >
        <button
          type="button"
          aria-label="Fechar overlay do grafo"
          onClick={onClose}
          style={{
            position: 'sticky',
            top: 10,
            right: 10,
            zIndex: 2,
            float: 'right',
            width: 34,
            height: 34,
            margin: 10,
            border: '1px solid rgba(24,24,28,0.14)',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.82)',
            color: '#1A1A1A',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          x
        </button>
        <ErrorBoundary>{children}</ErrorBoundary>
      </section>
    </div>
  );
}
