'use client';

import { CommandPalette } from '@/components/kloel/CommandPalette';
import { ErrorBoundary } from '@/components/kloel/ErrorBoundary';
import useCommandPalette from '@/hooks/useCommandPalette';
import {
  extractCheckoutProductList,
  extractCheckoutsFromDetail,
  extractPlansFromDetail,
  type CheckoutProductDetailShape,
  type CheckoutProductItem,
  type CheckoutProductListResponse,
} from '@/hooks/useCheckoutPlans.helpers';
import { useProducts } from '@/hooks/useProducts';
import { swrFetcher } from '@/lib/fetcher';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  KLOEL_GRAPH_NODES,
  KLOEL_GRAPH_PRIMARY_NODES,
  buildKloelGraphProductNodes,
  getKloelGraphOverlayLabel,
  resolveKloelGraphNodeForPathFromNodes,
} from './KloelGraph.routes';
import type {
  KloelGraphArea,
  KloelGraphEntityLike,
  KloelGraphNode,
  KloelGraphProductLike,
} from './KloelGraph.routes';

const CLICK_DRAG_THRESHOLD_PX = 6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_ZOOM = 0.56;
const MAX_ZOOM = 1.85;
const DEFAULT_ZOOM = 1;

interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

interface LayoutNode extends GraphPoint {
  readonly r: number;
}

interface GraphEdge {
  readonly from: string;
  readonly to: string;
}

interface NodeDragState extends GraphPoint {
  readonly offsetX: number;
  readonly offsetY: number;
}

const AREA_POSITIONS: Record<KloelGraphArea, GraphPoint> = {
  perfil: { x: 0, y: -310 },
  kloel: { x: 330, y: -245 },
  criar: { x: 420, y: 90 },
  afiliar: { x: 170, y: 340 },
  educar: { x: -170, y: 320 },
  conectar: { x: -420, y: 70 },
  consultar: { x: -320, y: -235 },
};

const MAX_CHECKOUT_GRAPH_PRODUCTS = 80;

async function loadCheckoutGraphProducts(): Promise<KloelGraphProductLike[]> {
  const rawList = await swrFetcher<CheckoutProductItem[] | CheckoutProductListResponse>(
    '/checkout/products',
  );
  const checkoutProducts = extractCheckoutProductList(rawList).slice(0, MAX_CHECKOUT_GRAPH_PRODUCTS);
  const details = await Promise.allSettled(
    checkoutProducts.map(async (product) => {
      const detail = await swrFetcher<CheckoutProductDetailShape>(`/checkout/products/${product.id}`);
      return {
        id: product.id,
        name: product.name,
        label: product.name,
        slug: product.slug ?? null,
        plans: extractPlansFromDetail(detail),
        checkouts: extractCheckoutsFromDetail(detail),
      } satisfies KloelGraphProductLike;
    }),
  );
  return details.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function mergeGraphProducts(
  products: readonly KloelGraphProductLike[] | undefined,
  checkoutProducts: readonly KloelGraphProductLike[] | undefined,
): KloelGraphProductLike[] {
  const merged = new Map<string, KloelGraphProductLike>();
  for (const product of products ?? []) {
    const id = normalizeGraphEntityId(product.id);
    if (id) {merged.set(id, product);}
  }

  const existingProducts = Array.from(merged.values());
  for (const checkoutProduct of checkoutProducts ?? []) {
    const match = findMatchingGraphProduct(checkoutProduct, existingProducts);
    const id = normalizeGraphEntityId(match?.id ?? checkoutProduct.id);
    if (!id) {continue;}
    const next: KloelGraphProductLike = {
      ...checkoutProduct,
      ...(match ?? {}),
      id,
      name: match?.name ?? checkoutProduct.name ?? null,
      label: match?.label ?? checkoutProduct.label ?? null,
      category: match?.category ?? checkoutProduct.category ?? null,
      status: match?.status ?? checkoutProduct.status ?? null,
      plans: mergeGraphEntityLists(
        match?.plans,
        match?.checkoutPlans,
        checkoutProduct.plans,
        checkoutProduct.checkoutPlans,
      ),
      checkouts: mergeGraphEntityLists(
        match?.checkouts,
        match?.checkoutTemplates,
        checkoutProduct.checkouts,
        checkoutProduct.checkoutTemplates,
      ),
    };
    merged.set(id, next);
  }
  return Array.from(merged.values());
}

function findMatchingGraphProduct(
  checkoutProduct: KloelGraphProductLike,
  products: readonly KloelGraphProductLike[],
): KloelGraphProductLike | undefined {
  const checkoutId = normalizeGraphEntityId(checkoutProduct.id);
  const checkoutSlug = normalizeText(checkoutProduct.slug);
  const checkoutName = normalizeText(checkoutProduct.name ?? checkoutProduct.label);
  return products.find((product) => {
    const productId = normalizeGraphEntityId(product.id);
    if (checkoutId && productId === checkoutId) {return true;}
    if (checkoutSlug && normalizeText(product.slug) === checkoutSlug) {return true;}
    return Boolean(checkoutName && normalizeText(product.name ?? product.label) === checkoutName);
  });
}

function mergeGraphEntityLists(
  ...groups: Array<readonly KloelGraphEntityLike[] | null | undefined>
): KloelGraphEntityLike[] {
  const seen = new Set<string>();
  const entities: KloelGraphEntityLike[] = [];
  for (const group of groups) {
    for (const entity of group ?? []) {
      const id = normalizeGraphEntityId(entity.id);
      if (!id || seen.has(id)) {continue;}
      seen.add(id);
      entities.push(entity);
    }
  }
  return entities;
}

function normalizeGraphEntityId(value: string | number | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function KloelGraphShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { products } = useProducts();
  const { data: checkoutProducts = [] } = useSWR(
    'kloel-graph-checkout-products',
    loadCheckoutGraphProducts,
    { keepPreviousData: true },
  );
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const [paletteMode, setPaletteMode] = useState<'full' | 'conversations'>('full');
  const [focusedArea, setFocusedArea] = useState<KloelGraphArea>('perfil');
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
  const focusedNode = activeNode ?? KLOEL_GRAPH_PRIMARY_NODES.find((node) => node.area === displayArea);
  const focusPoint = resolveLayoutPoint(focusedNode, layout, displayArea);

  useEffect(() => {
    for (const node of KLOEL_GRAPH_NODES) {
      try {
        void router.prefetch(node.route.split('?')[0]);
      } catch {}
    }
  }, [router]);

  const closeOverlay = useCallback(() => {
    router.push('/dashboard?graph=1');
  }, [router]);

  useEffect(() => {
    if (graphOnly || paletteProps.open) {return;}
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {return;}
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

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - event.deltaY * 0.0012)));
  }, []);

  const onSurfacePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {return;}
    surfaceDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: manualPan.x,
      panY: manualPan.y,
    };
    setIsSurfaceDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onSurfacePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = surfaceDragRef.current;
    if (!drag) {return;}
    setManualPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };

  const onSurfacePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    surfaceDragRef.current = null;
    setIsSurfaceDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  const onNodePointerDown = (nodeId: string, event: PointerEvent<HTMLButtonElement>) => {
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

  const onNodePointerMove = (nodeId: string, event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current[nodeId];
    if (!start) {return;}
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) {return;}
    setNodeOffsets((current) => ({
      ...current,
      [nodeId]: { x: start.offsetX + dx / zoom, y: start.offsetY + dy / zoom },
    }));
  };

  const onNodePointerUp = (node: KloelGraphNode, event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const start = pointerStartRef.current[node.id];
    delete pointerStartRef.current[node.id];
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (!start) {return;}

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance <= CLICK_DRAG_THRESHOLD_PX) {openNode(node);}
  };

  const onNodeKeyDown = (node: KloelGraphNode, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {return;}
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
        background: '#0A0A0C',
        color: '#E0DDD8',
        fontFamily: "'Sora', system-ui, sans-serif",
        touchAction: 'none',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} mode={commandPaletteMode} />

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, opacity: 0.6 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#0A0A0C',
          }}
        />
      </div>

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
            if (!from || !to) {return null;}
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(232,93,48,0.22)"
                strokeWidth={1.2 / zoom}
              />
            );
          })}
        </svg>

        {graphNodes.map((node) => {
          const point = layout.get(node.id);
          if (!point) {return null;}
          const offset = nodeOffsets[node.id] ?? { x: 0, y: 0 };
          return (
            <GraphNodeButton
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
            onClick={() => focusGalaxy(node.area)}
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
          onClick={openSearch}
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

      {!graphOnly && (
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
              onClick={closeOverlay}
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
      )}
    </div>
  );
}

function GraphNodeButton({
  node,
  point,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: {
  node: KloelGraphNode;
  point: LayoutNode;
  active: boolean;
  onPointerDown: (nodeId: string, event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (nodeId: string, event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (node: KloelGraphNode, event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (node: KloelGraphNode, event: KeyboardEvent<HTMLButtonElement>) => void;
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

function buildKloelGraphEdges(nodes: readonly KloelGraphNode[]): GraphEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => node.parentId && ids.has(node.parentId))
    .map((node) => ({ from: node.parentId as string, to: node.id }));
}

function computeKloelGraphLayout(nodes: readonly KloelGraphNode[]): Map<string, LayoutNode> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, KloelGraphNode[]>();
  const layout = new Map<string, LayoutNode>();

  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      const children = childrenByParent.get(node.parentId) ?? [];
      children.push(node);
      childrenByParent.set(node.parentId, children);
    }
  }

  for (const node of nodes) {
    if (node.type !== 'sun') {continue;}
    const anchor = AREA_POSITIONS[node.area];
    layout.set(node.id, { x: anchor.x, y: anchor.y, r: radiusForNode(node) });
  }

  const queue = nodes.filter((node) => node.type === 'sun');
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor];
    const parentPoint = layout.get(parent.id) ?? { ...AREA_POSITIONS[parent.area], r: radiusForNode(parent) };
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((child, index) => {
      const childRadius = radiusForNode(child);
      const baseRing = parent.type === 'sun' ? 96 : 64;
      const ring = baseRing + Math.floor(index / 10) * 58 + Math.sqrt(index + 1) * 7;
      const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
      layout.set(child.id, {
        x: parentPoint.x + Math.cos(angle) * ring,
        y: parentPoint.y + Math.sin(angle) * ring,
        r: childRadius,
      });
      queue.push(child);
    });
  }

  for (const node of nodes) {
    if (layout.has(node.id)) {continue;}
    const anchor = AREA_POSITIONS[node.area];
    layout.set(node.id, { ...anchor, r: radiusForNode(node) });
  }

  relaxLayout(nodes, layout);
  return layout;
}

function relaxLayout(nodes: readonly KloelGraphNode[], layout: Map<string, LayoutNode>) {
  const iterations = nodes.length > 240 ? 8 : nodes.length > 120 ? 14 : 24;
  for (let pass = 0; pass < iterations; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const aNode = nodes[i];
        const bNode = nodes[j];
        const a = layout.get(aNode.id);
        const b = layout.get(bNode.id);
        if (!a || !b) {continue;}
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const minimum = a.r + b.r + 10;
        if (distance >= minimum) {continue;}

        const push = (minimum - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        const aFixed = aNode.type === 'sun';
        const bFixed = bNode.type === 'sun';

        if (!aFixed) {
          layout.set(aNode.id, { ...a, x: a.x - ux * (bFixed ? push * 2 : push), y: a.y - uy * (bFixed ? push * 2 : push) });
        }
        if (!bFixed) {
          layout.set(bNode.id, { ...b, x: b.x + ux * (aFixed ? push * 2 : push), y: b.y + uy * (aFixed ? push * 2 : push) });
        }
      }
    }
  }
}

function radiusForNode(node: KloelGraphNode): number {
  if (node.type === 'sun') {return 39;}
  if (node.parentId?.startsWith('criar-product-')) {return 18;}
  if (node.type === 'entity') {return 24;}
  if (node.type === 'metric') {return 22;}
  return 26;
}

function resolveLayoutPoint(
  node: KloelGraphNode | undefined,
  layout: Map<string, LayoutNode>,
  fallbackArea: KloelGraphArea,
): GraphPoint {
  if (node) {
    const point = layout.get(node.id);
    if (point) {return point;}
  }
  return AREA_POSITIONS[node?.area ?? fallbackArea];
}
