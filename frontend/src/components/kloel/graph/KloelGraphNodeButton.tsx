'use client';

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { KloelGraphNode } from './KloelGraph.routes';
import type { LayoutNode } from './KloelGraphShell.helpers';
import { GRAPH_FONT, GRAPH_RADIUS, useGraphTheme } from './KloelGraphTheme';

/**
 * A single graph node — faithful port of the prototype: a circular body in ember
 * (suns = silver core, active = ember) with the label rendered as text BELOW the
 * circle, not inside a box. The interaction contract is unchanged from the prototype
 * (pointer down/move/up + keyboard, aria-label "Abrir <label>") so the shell's
 * drag-vs-click engine and all specs keep passing.
 */
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
  const { C } = useGraphTheme();
  const isSun = node.type === 'sun';
  const isCore = node.type === 'core';
  const isMass = isSun || isCore;
  const size = point.r * 2;

  const dotColor = active ? C.ember : isMass ? C.silver : C.dim;
  const labelColor = active ? C.silver : isMass ? C.text : C.muted;
  const labelSize = isMass ? 12 : Math.max(8.5, Math.min(11, point.r / 2.2));

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
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* circular node body */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: GRAPH_RADIUS.circle,
          background: dotColor,
          border: active ? `2px solid ${C.paper}` : 'none',
          boxShadow: active ? `0 0 0 1.5px ${C.ember}, 0 0 22px ${C.emberGlow}` : 'none',
          transition: 'background .28s ease, box-shadow .15s ease',
        }}
      />
      {/* label below the circle */}
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: `calc(100% + ${Math.max(4, point.r * 0.5)}px)`,
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontFamily: GRAPH_FONT,
          fontSize: labelSize,
          fontWeight: isMass ? 600 : 400,
          color: labelColor,
          textShadow: `0 1px 2px ${C.void}`,
          pointerEvents: 'none',
          transition: 'color .28s ease',
        }}
      >
        {node.label}
      </span>
    </button>
  );
}
