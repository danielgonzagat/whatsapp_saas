'use client';

import { CommandPalette } from '@/components/kloel/CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { useProducts } from '@/hooks/useProducts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { KloelGraphFloatingNav } from './KloelGraphFloatingNav';
import { KloelGraphNodeButton } from './KloelGraphNodeButton';
import { KloelGraphOverlay } from './KloelGraphOverlay';
import {
  KLOEL_GRAPH_NODES,
  KLOEL_GRAPH_PRIMARY_NODES,
  buildKloelGraphProductNodes,
  resolveKloelGraphNodeForPathFromNodes,
} from './KloelGraph.routes';
import type { KloelGraphArea, KloelGraphNode } from './KloelGraph.routes';
import {
  CLICK_DRAG_THRESHOLD_PX,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  buildKloelGraphEdges,
  computeKloelGraphLayout,
  loadCheckoutGraphProducts,
  mergeGraphProducts,
  resolveLayoutPoint,
  type GraphPoint,
  type NodeDragState,
} from './KloelGraphShell.helpers';
import { GRAPH_FONT, GraphThemeProvider, useGraphTheme } from './KloelGraphTheme';

function KloelGraphShellSurface({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { C } = useGraphTheme();
  const { products } = useProducts();
  const { data: checkoutProducts = [] } = useSWR(
    'kloel-graph-checkout-products',
    loadCheckoutGraphProducts,
    { keepPreviousData: true },
  );
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const [paletteMode, setPaletteMode] = useState<'full' | 'conversations'>('full');
  const [focusedArea, setFocusedArea] = useState<KloelGraphArea>('criar');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [manualPan, setManualPan] = useState<GraphPoint>({ x: 0, y: 0 });
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, GraphPoint>>({});
  const [isSurfaceDragging, setIsSurfaceDragging] = useState(false);
  const pointerStartRef = useRef<Record<string, NodeDragState>>({});
  const surfaceDragRef = useRef<(GraphPoint & { panX: number; panY: number }) | null>(null);

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const graphProducts = useMemo(
    () => mergeGraphProducts(products, checkoutProducts),
    [products, checkoutProducts],
  );
  const productNodes = useMemo(() => buildKloelGraphProductNodes(graphProducts), [graphProducts]);
  const graphNodes = useMemo(() => [...KLOEL_GRAPH_NODES, ...productNodes], [productNodes]);
  const activeNode = resolveKloelGraphNodeForPathFromNodes(pathname, params, graphNodes);
  const graphOnly = params.get('graph') === '1';
  const graphAction = params.get('graphAction');
  const commandPaletteMode: 'full' | 'conversations' =
    graphAction === 'recents' ? 'conversations' : paletteMode;
  const displayArea = activeNode?.area ?? focusedArea;
  const layout = useMemo(() => computeKloelGraphLayout(graphNodes), [graphNodes]);
  const edges = useMemo(() => buildKloelGraphEdges(graphNodes), [graphNodes]);
  const focusedNode =
    activeNode ?? KLOEL_GRAPH_PRIMARY_NODES.find((node) => node.area === displayArea);
  const focusPoint = resolveLayoutPoint(focusedNode, layout, displayArea);

  useEffect(() => {
    for (const node of KLOEL_GRAPH_NODES) {
      try {
        void router.prefetch(node.route.split('?')[0]);
      } catch {}
    }
  }, [router]);

  const closeOverlay = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('graph', '1');
    nextParams.delete('graphAction');
    const query = nextParams.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (graphOnly || paletteProps.open) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closeOverlay();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeOverlay, graphOnly, paletteProps.open]);

  const openNode = useCallback(
    (node: KloelGraphNode) => {
      if (node.id === 'kloel-search') {
        setPaletteMode('full');
        openPalette({ initialQuery: '' });
        return;
      }
      if (node.id === 'kloel-recents') {
        setPaletteMode('conversations');
        openPalette({ initialQuery: '' });
        return;
      }
      router.push(node.route);
    },
    [openPalette, router],
  );

  const focusGalaxy = useCallback((area: KloelGraphArea) => {
    setFocusedArea(area);
    setManualPan({ x: 0, y: 0 });
  }, []);

  const openSearch = useCallback(() => {
    setPaletteMode('full');
    openPalette({ initialQuery: '' });
  }, [openPalette]);

  useEffect(() => {
    if (graphAction === 'search' || graphAction === 'recents') {
      openPalette({ initialQuery: '' });
    }
  }, [graphAction, openPalette]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - event.deltaY * 0.0012)));
  }, []);

  const onSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    surfaceDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: manualPan.x,
      panY: manualPan.y,
    };
    setIsSurfaceDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = surfaceDragRef.current;
    if (!drag) {
      return;
    }
    setManualPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };

  const onSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    surfaceDragRef.current = null;
    setIsSurfaceDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  const onNodePointerDown = (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const offset = nodeOffsets[nodeId] ?? { x: 0, y: 0 };
    pointerStartRef.current[nodeId] = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onNodePointerMove = (nodeId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current[nodeId];
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) {
      return;
    }
    setNodeOffsets((current) => ({
      ...current,
      [nodeId]: { x: start.offsetX + dx / zoom, y: start.offsetY + dy / zoom },
    }));
  };

  const onNodePointerUp = (node: KloelGraphNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const start = pointerStartRef.current[node.id];
    delete pointerStartRef.current[node.id];
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (!start) {
      return;
    }

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance <= CLICK_DRAG_THRESHOLD_PX) {
      openNode(node);
    }
  };

  const onNodeKeyDown = (node: KloelGraphNode, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    openNode(node);
  };

  const worldStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    transform: `translate(calc(50vw + ${manualPan.x}px - ${focusPoint.x * zoom}px), calc(50vh + ${manualPan.y}px - ${focusPoint.y * zoom}px)) scale(${zoom})`,
    transformOrigin: '0 0',
    transition: isSurfaceDragging ? 'none' : 'transform 420ms cubic-bezier(.2,.7,.2,1)',
  };

  return (
    <div
      data-testid="kloel-graph-shell"
      onWheel={onWheel}
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onPointerCancel={onSurfacePointerUp}
      style={{
        position: 'fixed',
        inset: 0,
        minHeight: '100vh',
        overflow: 'hidden',
        background: C.void,
        color: C.text,
        fontFamily: GRAPH_FONT,
        touchAction: 'none',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} mode={commandPaletteMode} />

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: C.void }} />

      <div style={worldStyle}>
        <svg
          aria-hidden="true"
          width="1"
          height="1"
          viewBox="0 0 1 1"
          style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        >
          {edges.map((edge) => {
            const from = layout.get(edge.from);
            const to = layout.get(edge.to);
            if (!from || !to) {
              return null;
            }
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={C.emberBorder}
                strokeWidth={1.2 / zoom}
              />
            );
          })}
        </svg>

        {graphNodes.map((node) => {
          const point = layout.get(node.id);
          if (!point) {
            return null;
          }
          const offset = nodeOffsets[node.id] ?? { x: 0, y: 0 };
          return (
            <KloelGraphNodeButton
              key={node.id}
              node={node}
              point={{ ...point, x: point.x + offset.x, y: point.y + offset.y }}
              active={activeNode?.id === node.id || activeNode?.area === node.id}
              onPointerDown={onNodePointerDown}
              onPointerMove={onNodePointerMove}
              onPointerUp={onNodePointerUp}
              onKeyDown={onNodeKeyDown}
            />
          );
        })}
      </div>

      <KloelGraphFloatingNav
        focusedArea={displayArea}
        onFocusGalaxy={focusGalaxy}
        onSearch={openSearch}
      />

      {!graphOnly && (
        <KloelGraphOverlay activeNode={activeNode} onClose={closeOverlay}>
          {children}
        </KloelGraphOverlay>
      )}
    </div>
  );
}

/**
 * KloelGraph shell — the graph is the primary navigation surface and each route's
 * real screen renders inside the 80% overlay with the live graph behind it. Wraps
 * the surface in the prototype's own light/dark theme so the canvas matches the
 * canonical KloelGraph look without touching the host app theme.
 */
export function KloelGraphShell({ children }: { readonly children: ReactNode }) {
  return (
    <GraphThemeProvider>
      <KloelGraphShellSurface>{children}</KloelGraphShellSurface>
    </GraphThemeProvider>
  );
}
