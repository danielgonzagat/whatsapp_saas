'use client';

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { KloelGraphNode } from './KloelGraph.routes';
import type { LayoutNode } from './KloelGraphShell.helpers';

export function KloelGraphNodeButton({
  node,
  point,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: {
  readonly node: KloelGraphNode;
  readonly point: LayoutNode;
  readonly active: boolean;
  readonly onPointerDown: (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onPointerMove: (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onPointerUp: (node: KloelGraphNode, event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly onKeyDown: (node: KloelGraphNode, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}) {
  const isSun = node.type === 'sun';
  const size = point.r * 2;

  return (
    <button
      type="button"
      aria-label={`Abrir ${node.label}`}
      title={node.subtitle ?? node.label}
      onPointerDown={(event) => onPointerDown(node.id, event)}
      onPointerMove={(event) => onPointerMove(node.id, event)}
      onPointerUp={(event) => onPointerUp(node, event)}
      onKeyDown={(event) => onKeyDown(node, event)}
      style={{
        position: 'absolute',
        left: point.x,
        top: point.y,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        border: `1px solid ${active ? '#E85D30' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 6,
        background: active ? 'rgba(232,93,48,0.18)' : 'rgba(13,13,16,0.72)',
        boxShadow: active ? '0 0 28px rgba(232,93,48,0.30)' : '0 10px 28px rgba(0,0,0,0.28)',
        color: active ? '#E85D30' : '#E0DDD8',
        cursor: 'grab',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: isSun ? 10 : Math.max(7, Math.min(9.5, point.r / 2.4)),
        fontWeight: 600,
        letterSpacing: 0.8,
        lineHeight: 1.15,
        overflow: 'hidden',
        padding: 4,
        textAlign: 'center',
        textTransform: 'uppercase',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {node.label}
    </button>
  );
}
