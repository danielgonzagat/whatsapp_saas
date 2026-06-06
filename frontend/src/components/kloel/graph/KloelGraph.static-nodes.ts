type KloelGraphArea =
  | 'perfil'
  | 'kloel'
  | 'criar'
  | 'afiliar'
  | 'educar'
  | 'conectar'
  | 'consultar';

type KloelGraphNodeType = 'core' | 'sun' | 'route' | 'metric' | 'entity';

interface KloelGraphNode {
  readonly id: string;
  readonly label: string;
  readonly area: KloelGraphArea;
  readonly type: KloelGraphNodeType;
  readonly route: string;
  readonly parentId?: string;
  readonly subtitle?: string;
  readonly overlayLabel?: string;
}

type NodeSeed = readonly [
  id: string,
  label: string,
  area: KloelGraphArea,
  type: KloelGraphNodeType,
  route: string,
  parentId?: string | undefined,
  overlayLabel?: string | undefined,
];

const CHANNELS = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email'] as const;
const WALLET_TABS = ['saldo', 'extrato', 'saques', 'antecipacoes', 'movimentacoes'] as const;
const REPORT_TABS = [
  'vendas',
  'afterpay',
  'churn',
  'abandonos',
  'satisfacao',
  'afiliados',
  'indicadores',
  'assinaturas',
  'ind_prod',
  'recusa',
  'origem',
  'metricas',
  'estornos',
  'chargeback',
  'engajamento',
  'envio',
  'exportacoes',
] as const;

// Perfil sub-tabs that ContaView only exposes as `/settings?section=<key>` query
// params (resolveSettingsSection parses them) — surfaced here as nav nodes so the
// constellation can browse to them. Tuple: [sectionKey, label, overlayLabel].
const PERFIL_SECTION_TABS = [
  ['pessoal', 'Pessoal', 'Dados pessoais'],
  ['fiscal', 'Fiscal', 'Dados fiscais'],
  ['documentos', 'Docs', 'Documentos'],
  ['bancario', 'Banco', 'Dados bancarios'],
  ['perfil', 'Publico', 'Perfil publico'],
  ['equipe', 'Equipe', 'Equipe'],
  ['apps', 'Apps', 'Apps'],
  ['seguranca', 'Seguranca', 'Seguranca'],
] as const;

function toNode([id, label, area, type, route, parentId, overlayLabel]: NodeSeed): KloelGraphNode {
  return {
    id,
    label,
    area,
    type,
    route,
    ...(parentId ? { parentId } : {}),
    ...(overlayLabel ? { overlayLabel } : {}),
  };
}

const PRIMARY_NODE_SEEDS: readonly NodeSeed[] = [
  ['perfil', 'Perfil', 'perfil', 'core', '/settings', undefined, 'Perfil'],
  ['kloel', 'Kloel', 'kloel', 'sun', '/chat', undefined, 'Kloel'],
  ['criar', 'Criar', 'criar', 'sun', '/products', undefined, 'Produtos'],
  ['afiliar', 'Afiliar', 'afiliar', 'sun', '/produtos/afiliar-se', undefined, 'Afiliar-se'],
  ['educar', 'Educar', 'educar', 'sun', '/produtos/area-membros', undefined, 'Area de membros'],
  ['conectar', 'Conversar', 'conectar', 'sun', '/inbox', undefined, 'Conversar'],
  ['consultar', 'Consultar', 'consultar', 'sun', '/carteira/saldo', undefined, 'Consultar'],
];

export const KLOEL_GRAPH_PRIMARY_NODES = PRIMARY_NODE_SEEDS.map(toNode);

const CORE_ROUTE_SEEDS: readonly NodeSeed[] = [
  ['dashboard', 'Dashboard', 'perfil', 'route', '/dashboard', 'perfil', 'Dashboard'],
  [
    'dashboard-metric-total-revenue',
    'Receita total',
    'perfil',
    'metric',
    '/analytics?tab=vendas&graphMetric=total-revenue',
    'dashboard',
    'Receita total',
  ],
  [
    'dashboard-metric-month-revenue',
    'Este mes',
    'perfil',
    'metric',
    '/analytics?tab=vendas&graphMetric=month-revenue',
    'dashboard',
    'Este mes',
  ],
  [
    'dashboard-metric-today-revenue',
    'Hoje',
    'perfil',
    'metric',
    '/analytics?tab=vendas&graphMetric=today-revenue',
    'dashboard',
    'Vendas hoje',
  ],
  [
    'dashboard-metric-available-balance',
    'Saldo',
    'perfil',
    'metric',
    '/carteira/saldo?graphMetric=available-balance',
    'dashboard',
    'Saldo disponivel',
  ],
  [
    'dashboard-metric-pending-balance',
    'A receber',
    'perfil',
    'metric',
    '/carteira/saldo?graphMetric=pending-balance',
    'dashboard',
    'A receber',
  ],
  [
    'dashboard-metric-revenue',
    'Receita',
    'perfil',
    'metric',
    '/analytics?tab=vendas&graphMetric=revenue',
    'dashboard',
    'Receita',
  ],
  [
    'dashboard-metric-sales',
    'Vendas',
    'perfil',
    'metric',
    '/analytics?tab=vendas&graphMetric=sales',
    'dashboard',
    'Vendas',
  ],
  [
    'dashboard-metric-conversion',
    'Conversao',
    'perfil',
    'metric',
    '/analytics?tab=metricas&graphMetric=conversion',
    'dashboard',
    'Conversao',
  ],
  [
    'dashboard-metric-average-ticket',
    'Ticket medio',
    'perfil',
    'metric',
    '/analytics?tab=metricas&graphMetric=average-ticket',
    'dashboard',
    'Ticket medio',
  ],
  ['perfil-settings', 'Configuracoes', 'perfil', 'route', '/settings', 'perfil', 'Perfil'],
  [
    'perfil-privacy',
    'Privacidade',
    'perfil',
    'route',
    '/settings/privacy',
    'perfil-settings',
    'Privacidade',
  ],
  ['perfil-account', 'Conta', 'perfil', 'route', '/account', 'perfil', 'Conta'],
  ['kloel-chat', 'Novo Chat', 'kloel', 'route', '/chat', 'kloel', 'Kloel'],
  ['kloel-search', 'Buscar', 'kloel', 'route', '/chat?graphAction=search', 'kloel', 'Buscar'],
  ['kloel-recents', 'Recentes', 'kloel', 'route', '/chat?graphAction=recents', 'kloel', 'Recentes'],
  ['kloel-tools', 'Ferramentas', 'kloel', 'route', '/ferramentas', 'kloel', 'Ferramentas'],
  ['kloel-memoria', 'Memória', 'kloel', 'route', '/memoria', 'kloel', 'Memória'],
  ['kloel-cia', 'CIA', 'kloel', 'route', '/cia', 'kloel', 'CIA'],
  ['kloel-motor', 'Motor', 'kloel', 'route', '/admin/kloel-motor', 'kloel', 'Motor Kloel'],
  ['criar-products', 'Meus produtos', 'criar', 'route', '/products', 'criar', 'Produtos'],
  ['criar-produtos-legacy', 'Produtos', 'criar', 'route', '/produtos', 'criar', 'Produtos'],
  ['criar-new-product', 'Novo produto', 'criar', 'route', '/products/new', 'criar', 'Novo produto'],
  ['criar-product', 'Produto', 'criar', 'entity', '/products', 'criar', 'ProductNerveCenter'],
  ['criar-sites', 'Sites', 'criar', 'route', '/sites', 'criar', 'Sites'],
  ['criar-canvas', 'Canvas', 'criar', 'route', '/canvas', 'criar', 'Canvas'],
  ['criar-funnels', 'Funnels', 'criar', 'route', '/funnels', 'criar', 'Funnels'],
  ['criar-video', 'Video', 'criar', 'route', '/video', 'criar', 'Video'],
  [
    'afiliar-marketplace',
    'Marketplace',
    'afiliar',
    'route',
    '/produtos/afiliar-se',
    'afiliar',
    'Afiliar-se',
  ],
  ['afiliar-parcerias', 'Parcerias', 'afiliar', 'route', '/parcerias', 'afiliar', 'Parcerias'],
  [
    'afiliar-afiliados',
    'Afiliados',
    'afiliar',
    'route',
    '/parcerias/afiliados',
    'afiliar-parcerias',
    'Afiliados',
  ],
  [
    'afiliar-chat',
    'Chat',
    'afiliar',
    'route',
    '/parcerias/chat',
    'afiliar-parcerias',
    'Chat de parceiros',
  ],
  [
    'afiliar-colaboradores',
    'Colaboradores',
    'afiliar',
    'route',
    '/parcerias/colaboradores',
    'afiliar-parcerias',
    'Colaboradores',
  ],
  [
    'educar-area-membros',
    'Area membros',
    'educar',
    'route',
    '/produtos/area-membros',
    'educar',
    'Area de membros',
  ],
  ['conectar-inbox', 'Inbox', 'conectar', 'route', '/inbox', 'conectar', 'Inbox'],
  ['conectar-crm', 'CRM', 'conectar', 'route', '/vendas/pipeline', 'conectar', 'CRM'],
  ['conectar-vendas', 'Vendas', 'conectar', 'route', '/vendas', 'conectar-crm', 'Vendas'],
  ['conectar-anuncios', 'Anuncios', 'conectar', 'route', '/anuncios', 'conectar', 'Anuncios'],
  [
    'conectar-autopilot',
    'Autopilot',
    'conectar',
    'route',
    '/autopilot',
    'conectar-crm',
    'Autopilot',
  ],
  ['conectar-marketing', 'Marketing', 'conectar', 'route', '/marketing', 'conectar', 'Marketing'],
  ['conectar-leads', 'Leads', 'conectar', 'route', '/leads', 'conectar', 'Leads'],
  ['conectar-followups', 'Followups', 'conectar', 'route', '/followups', 'conectar', 'Followups'],
  ['conectar-flow', 'Flow', 'conectar', 'route', '/flow', 'conectar', 'Flow'],
  ['conectar-scrapers', 'Scrapers', 'conectar', 'route', '/scrapers', 'conectar', 'Scrapers'],
  ['conectar-whatsapp', 'WhatsApp', 'conectar', 'route', '/whatsapp', 'conectar', 'WhatsApp'],
  ['conectar-sales', 'Sales', 'conectar', 'route', '/sales', 'conectar-crm', 'Vendas'],
  [
    'conectar-channel-google-ads',
    'Google Ads',
    'conectar',
    'route',
    '/marketing/google-ads',
    'conectar-marketing',
    'Google Ads',
  ],
  [
    'consultar-analytics',
    'Analytics',
    'consultar',
    'route',
    '/analytics',
    'consultar',
    'Analytics',
  ],
  ['consultar-payments', 'Payments', 'consultar', 'route', '/payments', 'consultar', 'Pagamentos'],
  ['consultar-billing', 'Billing', 'consultar', 'route', '/billing', 'consultar', 'Billing'],
  ['consultar-pricing', 'Planos', 'consultar', 'route', '/pricing', 'consultar-billing', 'Planos'],
];

const dynamicRouteSeeds = [
  ...CHANNELS.map(
    (channel): NodeSeed => [
      `conectar-channel-${channel}`,
      channel[0].toUpperCase() + channel.slice(1),
      'conectar',
      'route',
      `/marketing/${channel}`,
      'conectar-marketing',
      channel[0].toUpperCase() + channel.slice(1),
    ],
  ),
  ...['meta', 'google', 'tiktok', 'rastreamento', 'regras'].map(
    (tab): NodeSeed => [
      `conectar-anuncios-${tab}`,
      tab[0].toUpperCase() + tab.slice(1),
      'conectar',
      'route',
      `/anuncios/${tab}`,
      'conectar-anuncios',
      'Anuncios',
    ],
  ),
  ...['gestao-vendas', 'fisicos', 'assinaturas'].map(
    (tab): NodeSeed => [
      `conectar-vendas-${tab}`,
      tab[0].toUpperCase() + tab.slice(1),
      'conectar',
      'route',
      `/vendas/${tab}`,
      'conectar-vendas',
      'Vendas',
    ],
  ),
  ...WALLET_TABS.map(
    (tab): NodeSeed => [
      `consultar-wallet-${tab}`,
      tab[0].toUpperCase() + tab.slice(1),
      'consultar',
      'route',
      `/carteira/${tab}`,
      'consultar',
      'Carteira',
    ],
  ),
  ...REPORT_TABS.map(
    (tab): NodeSeed => [
      `consultar-report-${tab}`,
      tab[0].toUpperCase() + tab.slice(1),
      'consultar',
      'route',
      `/analytics?tab=${tab}`,
      'consultar',
      'Relatorios',
    ],
  ),
  ...PERFIL_SECTION_TABS.map(
    ([sectionKey, label, overlayLabel]): NodeSeed => [
      `perfil-settings-${sectionKey}`,
      label,
      'perfil',
      'route',
      `/settings?section=${sectionKey}`,
      'perfil-settings',
      overlayLabel,
    ],
  ),
] as const;

export const KLOEL_GRAPH_ROUTE_NODES = [...CORE_ROUTE_SEEDS, ...dynamicRouteSeeds].map(toNode);
export const KLOEL_GRAPH_NODES = [...KLOEL_GRAPH_PRIMARY_NODES, ...KLOEL_GRAPH_ROUTE_NODES];
