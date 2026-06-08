import {
  extractCheckoutProductList,
  extractCheckoutsFromDetail,
  extractPlansFromDetail,
  type CheckoutProductDetailShape,
  type CheckoutProductItem,
  type CheckoutProductListResponse,
} from '@/hooks/useCheckoutPlans.helpers';
import { swrFetcher } from '@/lib/fetcher';

import type {
  KloelGraphArea,
  KloelGraphEntityLike,
  KloelGraphNode,
  KloelGraphProductLike,
} from './KloelGraph.routes';

export const CLICK_DRAG_THRESHOLD_PX = 4;
export const MIN_ZOOM = 0.56;
export const MAX_ZOOM = 1.85;
export const DEFAULT_ZOOM = 1;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_CHECKOUT_GRAPH_PRODUCTS = 80;

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface LayoutNode extends GraphPoint {
  readonly r: number;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly directed?: boolean | undefined;
}

export interface NodeDragState extends GraphPoint {
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

export async function loadCheckoutGraphProducts(): Promise<KloelGraphProductLike[]> {
  const rawList = await swrFetcher<CheckoutProductItem[] | CheckoutProductListResponse>(
    '/checkout/products',
  );
  const checkoutProducts = extractCheckoutProductList(rawList).slice(
    0,
    MAX_CHECKOUT_GRAPH_PRODUCTS,
  );
  return Promise.all(
    checkoutProducts.map(async (product) => {
      const baseProduct = {
        id: product.id,
        name: product.name,
        label: product.name,
        slug: product.slug ?? null,
        plans: [],
        checkouts: [],
      } satisfies KloelGraphProductLike;

      try {
        const detail = await swrFetcher<CheckoutProductDetailShape>(
          `/checkout/products/${product.id}`,
        );
        return {
          ...baseProduct,
          plans: extractPlansFromDetail(detail),
          checkouts: extractCheckoutsFromDetail(detail),
        } satisfies KloelGraphProductLike;
      } catch {
        return baseProduct;
      }
    }),
  );
}

export function mergeGraphProducts(
  products: readonly KloelGraphProductLike[] | undefined,
  checkoutProducts: readonly KloelGraphProductLike[] | undefined,
): KloelGraphProductLike[] {
  const merged = new Map<string, KloelGraphProductLike>();
  for (const product of products ?? []) {
    const id = normalizeGraphEntityId(product.id);
    if (id) {
      merged.set(id, product);
    }
  }

  const existingProducts = Array.from(merged.values());
  for (const checkoutProduct of checkoutProducts ?? []) {
    const match = findMatchingGraphProduct(checkoutProduct, existingProducts);
    const id = normalizeGraphEntityId(match?.id ?? checkoutProduct.id);
    if (!id) {
      continue;
    }
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

// Resolve the URL a graph node click navigates to. A base node (same pathname, no
// query) keeps context params but drops `graph`/`graphAction` and the view-selector
// keys sibling nodes declare (e.g. `section`/`tab`) so it never opens a stale sub-view.
export function resolveKloelGraphNodeRoute(
  node: KloelGraphNode,
  pathname: string,
  currentQuery: string,
  nodes: readonly KloelGraphNode[],
): string {
  const [nodePath, nodeQueryString = ''] = node.route.split('?');
  if (nodePath !== pathname || nodeQueryString) {
    return node.route;
  }
  const nextParams = new URLSearchParams(currentQuery);
  nextParams.delete('graph');
  nextParams.delete('graphAction');
  for (const sibling of nodes) {
    const [siblingPath, siblingQuery = ''] = sibling.route.split('?');
    if (siblingPath !== nodePath || !siblingQuery) {
      continue;
    }
    for (const key of new URLSearchParams(siblingQuery).keys()) {
      nextParams.delete(key);
    }
  }
  const query = nextParams.toString();
  return query ? `${nodePath}?${query}` : nodePath;
}

export function buildKloelGraphEdges(nodes: readonly KloelGraphNode[]): GraphEdge[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => node.parentId && ids.has(node.parentId))
    .map((node) => ({ from: node.parentId as string, to: node.id, directed: true }));
}

export function computeKloelGraphLayout(nodes: readonly KloelGraphNode[]): Map<string, LayoutNode> {
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
    if (node.type !== 'sun' && node.type !== 'core') {
      continue;
    }
    const anchor = AREA_POSITIONS[node.area];
    layout.set(node.id, { x: anchor.x, y: anchor.y, r: radiusForNode(node) });
  }

  const queue = nodes.filter((node) => node.type === 'sun' || node.type === 'core');
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parent = queue[cursor];
    const parentPoint = layout.get(parent.id) ?? {
      ...AREA_POSITIONS[parent.area],
      r: radiusForNode(parent),
    };
    const children = childrenByParent.get(parent.id) ?? [];
    children.forEach((child, index) => {
      const baseRing = parent.type === 'sun' || parent.type === 'core' ? 96 : 64;
      const ring = baseRing + Math.floor(index / 10) * 58 + Math.sqrt(index + 1) * 7;
      const angle = -Math.PI / 2 + index * GOLDEN_ANGLE;
      layout.set(child.id, {
        x: parentPoint.x + Math.cos(angle) * ring,
        y: parentPoint.y + Math.sin(angle) * ring,
        r: radiusForNode(child),
      });
      queue.push(child);
    });
  }

  for (const node of nodes) {
    if (layout.has(node.id)) {
      continue;
    }
    const anchor = AREA_POSITIONS[node.area];
    layout.set(node.id, { ...anchor, r: radiusForNode(node) });
  }

  relaxLayout(nodes, layout);
  return layout;
}

export function resolveLayoutPoint(
  node: KloelGraphNode | undefined,
  layout: Map<string, LayoutNode>,
  fallbackArea: KloelGraphArea,
): GraphPoint {
  if (node) {
    const point = layout.get(node.id);
    if (point) {
      return point;
    }
  }
  return AREA_POSITIONS[node?.area ?? fallbackArea];
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
    if (checkoutId && productId === checkoutId) {
      return true;
    }
    if (checkoutSlug && normalizeText(product.slug) === checkoutSlug) {
      return true;
    }
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
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      entities.push(entity);
    }
  }
  return entities;
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
        if (!a || !b) {
          continue;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const minimum = a.r + b.r + 10;
        if (distance >= minimum) {
          continue;
        }

        const push = (minimum - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        const aFixed = aNode.type === 'sun' || aNode.type === 'core';
        const bFixed = bNode.type === 'sun' || bNode.type === 'core';

        if (!aFixed) {
          layout.set(aNode.id, {
            ...a,
            x: a.x - ux * (bFixed ? push * 2 : push),
            y: a.y - uy * (bFixed ? push * 2 : push),
          });
        }
        if (!bFixed) {
          layout.set(bNode.id, {
            ...b,
            x: b.x + ux * (aFixed ? push * 2 : push),
            y: b.y + uy * (aFixed ? push * 2 : push),
          });
        }
      }
    }
  }
}

function radiusForNode(node: KloelGraphNode): number {
  if (node.type === 'core') {
    return 42;
  }
  if (node.type === 'sun') {
    return 39;
  }
  if (node.parentId?.startsWith('criar-product-')) {
    return 18;
  }
  if (node.type === 'entity') {
    return 24;
  }
  if (node.type === 'metric') {
    return 22;
  }
  return 26;
}

export interface KloelGraphMemberAreaLike extends KloelGraphEntityLike {
  readonly description?: string | null;
  readonly type?: string | null;
  readonly studentsCount?: number | null;
  readonly totalStudents?: number | null;
}

export function buildKloelGraphMemberAreaNodes(
  areas: readonly unknown[] | undefined,
): KloelGraphNode[] {
  return (areas ?? []).flatMap((rawArea) => {
    if (!isGraphMemberAreaLike(rawArea)) {
      return [];
    }

    const area = rawArea;
    const areaId = normalizeGraphEntityId(area.id);
    if (!areaId) {
      return [];
    }

    const label = area.name || area.label || area.title || area.slug || 'Area de membros';
    const status = area.active === false || area.isActive === false ? 'inativa' : 'ativa';
    const students = area.studentsCount ?? area.totalStudents;
    const subtitle = [
      typeof students === 'number' ? `${students} alunos` : area.description || area.type || null,
      status,
    ]
      .filter(Boolean)
      .join(' - ');

    return [
      {
        id: `educar-member-area-${areaId}`,
        label,
        area: 'educar' as const,
        type: 'entity' as const,
        route: `/produtos/area-membros/preview/${encodeURIComponent(areaId)}`,
        parentId: 'educar-area-membros',
        subtitle: subtitle || 'Area de membros',
        overlayLabel: 'Area de membros',
      },
    ];
  });
}

function isGraphMemberAreaLike(value: unknown): value is KloelGraphMemberAreaLike {
  return typeof value === 'object' && value !== null;
}

function normalizeGraphEntityId(value: string | number | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
