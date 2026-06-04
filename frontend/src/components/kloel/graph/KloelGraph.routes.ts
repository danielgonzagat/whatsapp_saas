import { KLOEL_GRAPH_NODES, KLOEL_GRAPH_PRIMARY_NODES } from './KloelGraph.static-nodes';

export type KloelGraphArea =
  | 'perfil'
  | 'kloel'
  | 'criar'
  | 'afiliar'
  | 'educar'
  | 'conectar'
  | 'consultar';

export type KloelGraphNodeType = 'core' | 'sun' | 'route' | 'metric' | 'entity';

export interface KloelGraphNode {
  readonly id: string;
  readonly label: string;
  readonly area: KloelGraphArea;
  readonly type: KloelGraphNodeType;
  readonly route: string;
  readonly parentId?: string;
  readonly subtitle?: string;
  readonly overlayLabel?: string;
}

export interface KloelGraphEntityLike {
  readonly id?: string | number;
  readonly name?: string | null;
  readonly label?: string | null;
  readonly title?: string | null;
  readonly slug?: string | null;
  readonly referenceCode?: string | null;
  readonly active?: boolean | null;
  readonly isActive?: boolean | null;
}

export interface KloelGraphProductLike extends KloelGraphEntityLike {
  readonly category?: string | null;
  readonly status?: string | null;
  readonly plans?: readonly KloelGraphEntityLike[] | null;
  readonly checkoutPlans?: readonly KloelGraphEntityLike[] | null;
  readonly checkouts?: readonly KloelGraphEntityLike[] | null;
  readonly checkoutTemplates?: readonly KloelGraphEntityLike[] | null;
}

export { PRODUCT_GRAPH_TABS, buildKloelGraphProductNodes } from './KloelGraph.product-nodes';
export {
  KLOEL_GRAPH_NODES,
  KLOEL_GRAPH_PRIMARY_NODES,
  KLOEL_GRAPH_ROUTE_NODES,
} from './KloelGraph.static-nodes';

const NODE_BY_ID = new Map(KLOEL_GRAPH_NODES.map((node) => [node.id, node]));

export function isKloelGraphEnabled(value?: string | null): boolean {
  const raw =
    value ?? process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED ?? process.env.KLOEL_GRAPH_ENABLED;
  if (raw == null) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
}

export function getKloelGraphNodeById(id: string): KloelGraphNode | undefined {
  return NODE_BY_ID.get(id);
}

export function resolveKloelGraphRoute(id: string): string {
  return getKloelGraphNodeById(id)?.route ?? '/dashboard?graph=1';
}

export function getKloelGraphOverlayLabel(node: KloelGraphNode | undefined): string {
  return node?.overlayLabel ?? node?.label ?? 'Kloel';
}

export function resolveKloelGraphNodeForPathFromNodes(
  pathname: string,
  searchParams: URLSearchParams,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const path = normalizePath(pathname);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'products' && parts[1] && parts[1] !== 'new') {
    return resolveProductNode(parts, searchParams, nodes);
  }
  if (parts[0] === 'checkout' && parts[1]) {
    return resolveCheckoutNode(parts[1], searchParams, path, nodes);
  }
  return findStaticRouteNode(path, searchParams, nodes);
}

export function resolveKloelGraphNodeForPath(
  pathname: string,
  searchParams: URLSearchParams,
): KloelGraphNode | undefined {
  const path = normalizePath(pathname);
  const exact = findStaticRouteNode(path, searchParams, KLOEL_GRAPH_NODES);
  if (exact) {
    return exact;
  }
  if (path === '/carteira') {
    return getKloelGraphNodeById('consultar-wallet-saldo');
  }
  if (path === '/analytics') {
    return (
      getKloelGraphNodeById(`consultar-report-${searchParams.get('tab') || 'vendas'}`) ??
      getKloelGraphNodeById('consultar')
    );
  }
  for (const [prefix, nodeId] of FALLBACK_PREFIXES) {
    if (path.startsWith(prefix)) {
      return getKloelGraphNodeById(nodeId);
    }
  }
  return undefined;
}

function resolveProductNode(
  parts: string[],
  searchParams: URLSearchParams,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const productNodeId = `criar-product-${parts[1]}`;
  const planId = parts[2] === 'plans' ? parts[3] : null;
  const tab = searchParams.get('tab');
  if (planId) {
    return (
      nodes.find((node) => node.id === `${productNodeId}-plan-${planId}`) ??
      fallbackProductNode(productNodeId, nodes)
    );
  }
  if (tab) {
    return (
      nodes.find((node) => node.id === `${productNodeId}-${tab}`) ??
      fallbackProductNode(productNodeId, nodes)
    );
  }
  return fallbackProductNode(productNodeId, nodes);
}

function resolveCheckoutNode(
  checkoutId: string,
  searchParams: URLSearchParams,
  path: string,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const productId = searchParams.get('productId');
  if (!productId) {
    return findStaticRouteNode(path, searchParams, nodes) ?? getKloelGraphNodeById('criar-product');
  }
  const productNodeId = `criar-product-${productId}`;
  const checkoutNode =
    nodes.find((node) => node.id === `${productNodeId}-checkout-${checkoutId}`) ??
    nodes.find((node) => node.id === `${productNodeId}-plan-${checkoutId}-checkout`);
  if (searchParams.get('focus') !== 'order-bump') {
    return checkoutNode ?? getKloelGraphNodeById('criar-product');
  }
  return (
    nodes.find((node) => node.id === `${checkoutNode?.id}-order-bump`) ??
    checkoutNode ??
    getKloelGraphNodeById('criar-product')
  );
}

function fallbackProductNode(
  productNodeId: string,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  return nodes.find((node) => node.id === productNodeId) ?? getKloelGraphNodeById('criar-product');
}

const FALLBACK_PREFIXES = [
  ['/products/', 'criar-product'],
  ['/produtos/area-membros', 'educar'],
  ['/produtos/afiliar-se', 'afiliar'],
  ['/parcerias', 'afiliar-parcerias'],
  ['/marketing/', 'conectar-marketing'],
  ['/anuncios', 'conectar-anuncios'],
  ['/vendas', 'conectar-vendas'],
  ['/autopilot', 'conectar-autopilot'],
  ['/carteira/', 'consultar'],
  ['/sites', 'criar-sites'],
  ['/canvas', 'criar-canvas'],
  ['/ferramentas', 'kloel-tools'],
] as const;

function findStaticRouteNode(
  path: string,
  searchParams: URLSearchParams,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const nonSunNodes = nodes.filter((node) => node.type !== 'sun');
  return (
    nonSunNodes.find(
      (node) => node.route.includes('?') && routeMatches(node.route, path, searchParams),
    ) ??
    nonSunNodes.find(
      (node) => !node.route.includes('?') && routeMatches(node.route, path, searchParams),
    ) ??
    KLOEL_GRAPH_PRIMARY_NODES.find((node) => routeMatches(node.route, path, searchParams))
  );
}

function routeMatches(route: string, path: string, searchParams: URLSearchParams): boolean {
  const [routePath, query = ''] = route.split('?');
  if (normalizePath(routePath) !== path) {
    return false;
  }
  if (!query) {
    return true;
  }
  const expected = new URLSearchParams(query);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/dashboard';
  }
  const [path] = pathname.split('?');
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}
