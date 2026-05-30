export type KloelGraphArea =
  | 'perfil'
  | 'kloel'
  | 'criar'
  | 'afiliar'
  | 'educar'
  | 'conectar'
  | 'consultar';

export type KloelGraphNodeType = 'sun' | 'route' | 'metric' | 'entity';

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

const CHANNELS = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'] as const;
const WALLET_TABS = ['saldo', 'extrato', 'saques', 'antecipacoes', 'movimentacoes'] as const;
const REPORT_TABS = ['vendas', 'assinaturas', 'abandonos', 'estornos'] as const;

export const PRODUCT_GRAPH_TABS = [
  { id: 'dados', label: 'Dados gerais' },
  { id: 'planos', label: 'Planos' },
  { id: 'checkouts', label: 'Checkouts' },
  { id: 'urls', label: 'URLs' },
  { id: 'comissao', label: 'Comissao' },
  { id: 'cupons', label: 'Cupons' },
  { id: 'campanhas', label: 'Campanhas' },
  { id: 'avaliacoes', label: 'Avaliacoes' },
  { id: 'afterpay', label: 'After Pay' },
  { id: 'ia', label: 'IA' },
] as const;

export const KLOEL_GRAPH_PRIMARY_NODES: readonly KloelGraphNode[] = [
  {
    id: 'perfil',
    label: 'Perfil',
    area: 'perfil',
    type: 'sun',
    route: '/settings',
    overlayLabel: 'Perfil',
  },
  {
    id: 'kloel',
    label: 'Kloel',
    area: 'kloel',
    type: 'sun',
    route: '/chat',
    overlayLabel: 'Kloel',
  },
  {
    id: 'criar',
    label: 'Criar',
    area: 'criar',
    type: 'sun',
    route: '/products',
    overlayLabel: 'Produtos',
  },
  {
    id: 'afiliar',
    label: 'Afiliar',
    area: 'afiliar',
    type: 'sun',
    route: '/produtos/afiliar-se',
    overlayLabel: 'Afiliar-se',
  },
  {
    id: 'educar',
    label: 'Educar',
    area: 'educar',
    type: 'sun',
    route: '/produtos/area-membros',
    overlayLabel: 'Area de membros',
  },
  {
    id: 'conectar',
    label: 'Conversar',
    area: 'conectar',
    type: 'sun',
    route: '/inbox',
    overlayLabel: 'Conversar',
  },
  {
    id: 'consultar',
    label: 'Consultar',
    area: 'consultar',
    type: 'sun',
    route: '/carteira/saldo',
    overlayLabel: 'Consultar',
  },
];

export const KLOEL_GRAPH_ROUTE_NODES: readonly KloelGraphNode[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    area: 'perfil',
    type: 'route',
    route: '/dashboard',
    parentId: 'perfil',
    overlayLabel: 'Dashboard',
  },
  {
    id: 'perfil-settings',
    label: 'Configuracoes',
    area: 'perfil',
    type: 'route',
    route: '/settings',
    parentId: 'perfil',
    overlayLabel: 'Perfil',
  },
  {
    id: 'perfil-privacy',
    label: 'Privacidade',
    area: 'perfil',
    type: 'route',
    route: '/settings/privacy',
    parentId: 'perfil-settings',
    overlayLabel: 'Privacidade',
  },
  {
    id: 'perfil-account',
    label: 'Conta',
    area: 'perfil',
    type: 'route',
    route: '/account',
    parentId: 'perfil',
    overlayLabel: 'Conta',
  },
  {
    id: 'kloel-chat',
    label: 'Novo Chat',
    area: 'kloel',
    type: 'route',
    route: '/chat',
    parentId: 'kloel',
    overlayLabel: 'Kloel',
  },
  {
    id: 'kloel-search',
    label: 'Buscar',
    area: 'kloel',
    type: 'route',
    route: '/chat?graphAction=search',
    parentId: 'kloel',
    overlayLabel: 'Buscar',
  },
  {
    id: 'kloel-images',
    label: 'Imagens',
    area: 'kloel',
    type: 'route',
    route: '/chat?graphAction=images',
    parentId: 'kloel',
    overlayLabel: 'Imagens',
  },
  {
    id: 'kloel-recents',
    label: 'Recentes',
    area: 'kloel',
    type: 'route',
    route: '/chat?graphAction=recents',
    parentId: 'kloel',
    overlayLabel: 'Recentes',
  },
  {
    id: 'kloel-tools',
    label: 'Ferramentas',
    area: 'kloel',
    type: 'route',
    route: '/ferramentas',
    parentId: 'kloel',
    overlayLabel: 'Ferramentas',
  },
  {
    id: 'kloel-cia',
    label: 'CIA',
    area: 'kloel',
    type: 'route',
    route: '/cia',
    parentId: 'kloel',
    overlayLabel: 'CIA',
  },
  {
    id: 'kloel-motor',
    label: 'Motor',
    area: 'kloel',
    type: 'route',
    route: '/admin/kloel-motor',
    parentId: 'kloel',
    overlayLabel: 'Motor Kloel',
  },
  {
    id: 'criar-products',
    label: 'Meus produtos',
    area: 'criar',
    type: 'route',
    route: '/products',
    parentId: 'criar',
    overlayLabel: 'Produtos',
  },
  {
    id: 'criar-produtos-legacy',
    label: 'Produtos',
    area: 'criar',
    type: 'route',
    route: '/produtos',
    parentId: 'criar',
    overlayLabel: 'Produtos',
  },
  {
    id: 'criar-new-product',
    label: 'Novo produto',
    area: 'criar',
    type: 'route',
    route: '/products/new',
    parentId: 'criar',
    overlayLabel: 'Novo produto',
  },
  {
    id: 'criar-product',
    label: 'Produto',
    area: 'criar',
    type: 'entity',
    route: '/products',
    parentId: 'criar',
    overlayLabel: 'ProductNerveCenter',
  },
  {
    id: 'criar-sites',
    label: 'Sites',
    area: 'criar',
    type: 'route',
    route: '/sites',
    parentId: 'criar',
    overlayLabel: 'Sites',
  },
  {
    id: 'criar-canvas',
    label: 'Canvas',
    area: 'criar',
    type: 'route',
    route: '/canvas',
    parentId: 'criar',
    overlayLabel: 'Canvas',
  },
  {
    id: 'criar-funnels',
    label: 'Funnels',
    area: 'criar',
    type: 'route',
    route: '/funnels',
    parentId: 'criar',
    overlayLabel: 'Funnels',
  },
  {
    id: 'criar-video',
    label: 'Video',
    area: 'criar',
    type: 'route',
    route: '/video',
    parentId: 'criar',
    overlayLabel: 'Video',
  },
  {
    id: 'afiliar-marketplace',
    label: 'Marketplace',
    area: 'afiliar',
    type: 'route',
    route: '/produtos/afiliar-se',
    parentId: 'afiliar',
    overlayLabel: 'Afiliar-se',
  },
  {
    id: 'afiliar-parcerias',
    label: 'Parcerias',
    area: 'afiliar',
    type: 'route',
    route: '/parcerias',
    parentId: 'afiliar',
    overlayLabel: 'Parcerias',
  },
  {
    id: 'afiliar-afiliados',
    label: 'Afiliados',
    area: 'afiliar',
    type: 'route',
    route: '/parcerias/afiliados',
    parentId: 'afiliar-parcerias',
    overlayLabel: 'Afiliados',
  },
  {
    id: 'afiliar-chat',
    label: 'Chat',
    area: 'afiliar',
    type: 'route',
    route: '/parcerias/chat',
    parentId: 'afiliar-parcerias',
    overlayLabel: 'Chat de parceiros',
  },
  {
    id: 'afiliar-colaboradores',
    label: 'Colaboradores',
    area: 'afiliar',
    type: 'route',
    route: '/parcerias/colaboradores',
    parentId: 'afiliar-parcerias',
    overlayLabel: 'Colaboradores',
  },
  {
    id: 'educar-area-membros',
    label: 'Area membros',
    area: 'educar',
    type: 'route',
    route: '/produtos/area-membros',
    parentId: 'educar',
    overlayLabel: 'Area de membros',
  },
  {
    id: 'conectar-inbox',
    label: 'Inbox',
    area: 'conectar',
    type: 'route',
    route: '/inbox',
    parentId: 'conectar',
    overlayLabel: 'Inbox',
  },
  {
    id: 'conectar-crm',
    label: 'CRM',
    area: 'conectar',
    type: 'route',
    route: '/vendas/pipeline',
    parentId: 'conectar',
    overlayLabel: 'CRM',
  },
  {
    id: 'conectar-vendas',
    label: 'Vendas',
    area: 'conectar',
    type: 'route',
    route: '/vendas',
    parentId: 'conectar-crm',
    overlayLabel: 'Vendas',
  },
  {
    id: 'conectar-anuncios',
    label: 'Anuncios',
    area: 'conectar',
    type: 'route',
    route: '/anuncios',
    parentId: 'conectar',
    overlayLabel: 'Anuncios',
  },
  {
    id: 'conectar-autopilot',
    label: 'Autopilot',
    area: 'conectar',
    type: 'route',
    route: '/autopilot',
    parentId: 'conectar-crm',
    overlayLabel: 'Autopilot',
  },
  {
    id: 'conectar-marketing',
    label: 'Marketing',
    area: 'conectar',
    type: 'route',
    route: '/marketing',
    parentId: 'conectar',
    overlayLabel: 'Marketing',
  },
  {
    id: 'conectar-leads',
    label: 'Leads',
    area: 'conectar',
    type: 'route',
    route: '/leads',
    parentId: 'conectar',
    overlayLabel: 'Leads',
  },
  {
    id: 'conectar-followups',
    label: 'Followups',
    area: 'conectar',
    type: 'route',
    route: '/followups',
    parentId: 'conectar',
    overlayLabel: 'Followups',
  },
  ...CHANNELS.map((channel) => ({
    id: `conectar-channel-${channel}`,
    label: channel[0].toUpperCase() + channel.slice(1),
    area: 'conectar' as const,
    type: 'route' as const,
    route: `/marketing/${channel}`,
    parentId: 'conectar-marketing',
    overlayLabel: channel[0].toUpperCase() + channel.slice(1),
  })),
  {
    id: 'conectar-channel-google-ads',
    label: 'Google Ads',
    area: 'conectar',
    type: 'route',
    route: '/marketing/google-ads',
    parentId: 'conectar-marketing',
    overlayLabel: 'Google Ads',
  },
  ...['meta', 'google', 'tiktok', 'rastreamento', 'regras'].map((tab) => ({
    id: `conectar-anuncios-${tab}`,
    label: tab[0].toUpperCase() + tab.slice(1),
    area: 'conectar' as const,
    type: 'route' as const,
    route: `/anuncios/${tab}`,
    parentId: 'conectar-anuncios',
    overlayLabel: 'Anuncios',
  })),
  ...['gestao-vendas', 'fisicos', 'assinaturas'].map((tab) => ({
    id: `conectar-vendas-${tab}`,
    label: tab[0].toUpperCase() + tab.slice(1),
    area: 'conectar' as const,
    type: 'route' as const,
    route: `/vendas/${tab}`,
    parentId: 'conectar-vendas',
    overlayLabel: 'Vendas',
  })),
  ...WALLET_TABS.map((tab) => ({
    id: `consultar-wallet-${tab}`,
    label: tab[0].toUpperCase() + tab.slice(1),
    area: 'consultar' as const,
    type: 'route' as const,
    route: `/carteira/${tab}`,
    parentId: 'consultar',
    overlayLabel: 'Carteira',
  })),
  ...REPORT_TABS.map((tab) => ({
    id: `consultar-report-${tab}`,
    label: tab[0].toUpperCase() + tab.slice(1),
    area: 'consultar' as const,
    type: 'route' as const,
    route: `/analytics?tab=${tab}`,
    parentId: 'consultar',
    overlayLabel: 'Relatorios',
  })),
  {
    id: 'consultar-analytics',
    label: 'Analytics',
    area: 'consultar',
    type: 'route',
    route: '/analytics',
    parentId: 'consultar',
    overlayLabel: 'Analytics',
  },
  {
    id: 'consultar-payments',
    label: 'Payments',
    area: 'consultar',
    type: 'route',
    route: '/payments',
    parentId: 'consultar',
    overlayLabel: 'Pagamentos',
  },
  {
    id: 'consultar-billing',
    label: 'Billing',
    area: 'consultar',
    type: 'route',
    route: '/billing',
    parentId: 'consultar',
    overlayLabel: 'Billing',
  },
];

export const KLOEL_GRAPH_NODES: readonly KloelGraphNode[] = [
  ...KLOEL_GRAPH_PRIMARY_NODES,
  ...KLOEL_GRAPH_ROUTE_NODES,
];

const NODE_BY_ID = new Map(KLOEL_GRAPH_NODES.map((node) => [node.id, node]));

export function isKloelGraphEnabled(value?: string | null): boolean {
  const raw = value ?? process.env.NEXT_PUBLIC_KLOEL_GRAPH_ENABLED ?? process.env.KLOEL_GRAPH_ENABLED;
  return raw === 'true' || raw === '1' || raw === 'on';
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

export function buildKloelGraphProductNodes(
  products: readonly KloelGraphProductLike[] | undefined,
): KloelGraphNode[] {
  return (products ?? []).flatMap((product) => {
    const productId = resolveGraphEntityId(product);
    if (!productId) {return [];}

    const encodedProductId = encodeURIComponent(productId);
    const label = resolveGraphEntityLabel(product, 'Produto');
    const productNodeId = `criar-product-${productId}`;
    const productNode: KloelGraphNode = {
      id: productNodeId,
      label,
      area: 'criar',
      type: 'entity',
      route: `/products/${encodedProductId}`,
      parentId: 'criar',
      subtitle: [product.category, product.status].filter(Boolean).join(' - ') || 'Produto',
      overlayLabel: 'ProductNerveCenter',
    };

    const tabNodes = PRODUCT_GRAPH_TABS.map((tab) => ({
      id: `${productNodeId}-${tab.id}`,
      label: tab.label,
      area: 'criar' as const,
      type: 'entity' as const,
      route: `/products/${encodedProductId}?tab=${tab.id}`,
      parentId: productNodeId,
      subtitle: `${label} - ${tab.label}`,
      overlayLabel: 'ProductNerveCenter',
    }));

    const planNodes = collectGraphEntities(product.checkoutPlans, product.plans).flatMap((plan) => {
      const planId = resolveGraphEntityId(plan);
      if (!planId) {return [];}
      const planLabel = resolveGraphEntityLabel(plan, 'Plano');
      const planNodeId = `${productNodeId}-plan-${planId}`;
      const checkoutNodeId = `${planNodeId}-checkout`;
      return [
        {
          id: planNodeId,
          label: planLabel,
          area: 'criar' as const,
          type: 'entity' as const,
          route: `/products/${encodedProductId}/plans/${encodeURIComponent(planId)}`,
          parentId: `${productNodeId}-planos`,
          subtitle: ['Plano', describeGraphEntityStatus(plan)].filter(Boolean).join(' - '),
          overlayLabel: 'Plano',
        },
        {
          id: checkoutNodeId,
          label: 'Checkout',
          area: 'criar' as const,
          type: 'entity' as const,
          route: buildCheckoutEditorRoute(planId, productId, label, 'checkout-appearance'),
          parentId: planNodeId,
          subtitle: planLabel,
          overlayLabel: 'Checkout',
        },
        {
          id: `${checkoutNodeId}-order-bump`,
          label: 'Order Bump',
          area: 'criar' as const,
          type: 'entity' as const,
          route: buildCheckoutEditorRoute(planId, productId, label, 'order-bump'),
          parentId: checkoutNodeId,
          subtitle: 'Dentro do checkout',
          overlayLabel: 'Checkout',
        },
      ];
    });

    const checkoutNodes = collectGraphEntities(product.checkoutTemplates, product.checkouts).flatMap(
      (checkout) => {
        const checkoutId = resolveGraphEntityId(checkout);
        if (!checkoutId) {return [];}
        const checkoutLabel = resolveGraphEntityLabel(checkout, 'Checkout');
        const checkoutNodeId = `${productNodeId}-checkout-${checkoutId}`;
        return [
          {
            id: checkoutNodeId,
            label: checkoutLabel,
            area: 'criar' as const,
            type: 'entity' as const,
            route: buildCheckoutEditorRoute(checkoutId, productId, label, 'checkout-appearance'),
            parentId: `${productNodeId}-checkouts`,
            subtitle: ['Checkout', describeGraphEntityStatus(checkout)].filter(Boolean).join(' - '),
            overlayLabel: 'Checkout',
          },
          {
            id: `${checkoutNodeId}-order-bump`,
            label: 'Order Bump',
            area: 'criar' as const,
            type: 'entity' as const,
            route: buildCheckoutEditorRoute(checkoutId, productId, label, 'order-bump'),
            parentId: checkoutNodeId,
            subtitle: 'Dentro do checkout',
            overlayLabel: 'Checkout',
          },
        ];
      },
    );

    return [productNode, ...tabNodes, ...planNodes, ...checkoutNodes];
  });
}

function collectGraphEntities(
  ...groups: Array<readonly KloelGraphEntityLike[] | null | undefined>
): KloelGraphEntityLike[] {
  const seen = new Set<string>();
  const entities: KloelGraphEntityLike[] = [];
  for (const group of groups) {
    for (const entity of group ?? []) {
      const id = resolveGraphEntityId(entity);
      if (!id || seen.has(id)) {continue;}
      seen.add(id);
      entities.push(entity);
    }
  }
  return entities;
}

function resolveGraphEntityId(entity: KloelGraphEntityLike): string {
  return String(entity.id ?? '').trim();
}

function resolveGraphEntityLabel(entity: KloelGraphEntityLike, fallback: string): string {
  return (
    String(entity.name || entity.label || entity.title || entity.referenceCode || entity.slug || fallback)
      .trim() || fallback
  );
}

function describeGraphEntityStatus(entity: KloelGraphEntityLike): string | null {
  if (entity.active === false || entity.isActive === false) {return 'inativo';}
  if (entity.active === true || entity.isActive === true) {return 'ativo';}
  return null;
}

function buildCheckoutEditorRoute(
  checkoutId: string,
  productId: string,
  productName: string,
  focus: 'checkout-appearance' | 'order-bump',
): string {
  const params = new URLSearchParams({ source: 'products', productId, productName, focus });
  return `/checkout/${encodeURIComponent(checkoutId)}?${params.toString()}`;
}

export function resolveKloelGraphNodeForPathFromNodes(
  pathname: string,
  searchParams: URLSearchParams,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const path = normalizePath(pathname);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts[0] === 'products' && parts[1] && parts[1] !== 'new') {
    const productId = parts[1];
    const productNodeId = `criar-product-${productId}`;
    const planId = parts[2] === 'plans' ? parts[3] : null;
    if (planId) {
      return (
        nodes.find((node) => node.id === `${productNodeId}-plan-${planId}`) ??
        nodes.find((node) => node.id === productNodeId) ??
        getKloelGraphNodeById('criar-product')
      );
    }

    const tab = searchParams.get('tab');
    if (tab) {
      return (
        nodes.find((node) => node.id === `${productNodeId}-${tab}`) ??
        nodes.find((node) => node.id === productNodeId) ??
        getKloelGraphNodeById('criar-product')
      );
    }
    return nodes.find((node) => node.id === productNodeId) ?? getKloelGraphNodeById('criar-product');
  }

  if (parts[0] === 'checkout' && parts[1]) {
    const checkoutId = parts[1];
    const productId = searchParams.get('productId');
    if (productId) {
      const productNodeId = `criar-product-${productId}`;
      const checkoutNode =
        nodes.find((node) => node.id === `${productNodeId}-checkout-${checkoutId}`) ??
        nodes.find((node) => node.id === `${productNodeId}-plan-${checkoutId}-checkout`);
      if (searchParams.get('focus') === 'order-bump') {
        return (
          nodes.find((node) => node.id === `${checkoutNode?.id}-order-bump`) ??
          checkoutNode ??
          getKloelGraphNodeById('criar-product')
        );
      }
      return checkoutNode ?? getKloelGraphNodeById('criar-product');
    }
    return findStaticRouteNode(path, searchParams, nodes) ?? getKloelGraphNodeById('criar-product');
  }

  return resolveKloelGraphNodeForPath(pathname, searchParams);
}

export function resolveKloelGraphNodeForPath(
  pathname: string,
  searchParams: URLSearchParams,
): KloelGraphNode | undefined {
  const path = normalizePath(pathname);
  const exact = findStaticRouteNode(path, searchParams, KLOEL_GRAPH_NODES);
  if (exact) {return exact;}

  if (path === '/carteira') {return getKloelGraphNodeById('consultar-wallet-saldo');}
  if (path === '/analytics') {
    const tab = searchParams.get('tab') || 'vendas';
    return getKloelGraphNodeById(`consultar-report-${tab}`) ?? getKloelGraphNodeById('consultar');
  }

  if (path.startsWith('/products/')) {return getKloelGraphNodeById('criar-product');}
  if (path.startsWith('/produtos/area-membros')) {return getKloelGraphNodeById('educar');}
  if (path.startsWith('/produtos/afiliar-se')) {return getKloelGraphNodeById('afiliar');}
  if (path.startsWith('/parcerias')) {return getKloelGraphNodeById('afiliar-parcerias');}
  if (path.startsWith('/marketing/')) {return getKloelGraphNodeById('conectar-marketing');}
  if (path.startsWith('/anuncios')) {return getKloelGraphNodeById('conectar-anuncios');}
  if (path.startsWith('/vendas')) {return getKloelGraphNodeById('conectar-vendas');}
  if (path.startsWith('/autopilot')) {return getKloelGraphNodeById('conectar-autopilot');}
  if (path.startsWith('/carteira/')) {return getKloelGraphNodeById('consultar');}
  if (path.startsWith('/sites')) {return getKloelGraphNodeById('criar-sites');}
  if (path.startsWith('/canvas')) {return getKloelGraphNodeById('criar-canvas');}
  if (path.startsWith('/ferramentas')) {return getKloelGraphNodeById('kloel-tools');}

  return undefined;
}

function findStaticRouteNode(
  path: string,
  searchParams: URLSearchParams,
  nodes: readonly KloelGraphNode[],
): KloelGraphNode | undefined {
  const nonSunNodes = nodes.filter((node) => node.type !== 'sun');
  return (
    nonSunNodes.find((node) => node.route.includes('?') && routeMatches(node.route, path, searchParams)) ??
    nonSunNodes.find((node) => !node.route.includes('?') && routeMatches(node.route, path, searchParams)) ??
    KLOEL_GRAPH_PRIMARY_NODES.find((node) => routeMatches(node.route, path, searchParams))
  );
}

function routeMatches(route: string, path: string, searchParams: URLSearchParams): boolean {
  const [routePath, query = ''] = route.split('?');
  if (normalizePath(routePath) !== path) {return false;}
  if (!query) {return true;}
  const expected = new URLSearchParams(query);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {return false;}
  }
  return true;
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {return '/dashboard';}
  const [path] = pathname.split('?');
  if (path.length > 1 && path.endsWith('/')) {return path.slice(0, -1);}
  return path;
}
