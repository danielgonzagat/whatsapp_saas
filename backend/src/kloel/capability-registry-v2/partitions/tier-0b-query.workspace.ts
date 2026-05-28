import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY sub-partition — Tier 0B (query / workspace).
 *
 * Read-only queries scoped to workspace administration: analytics, billing,
 * settings, wallet balance and statement. Extracted from `./tier-0b-query`
 * (Gate-fix2-D, 2026-05-28).
 */
export const TIER_0B_QUERY_WORKSPACE_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'get_analytics',
    title: 'Analytics',
    description: 'Obtém métricas e analytics do workspace',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      { key: 'metric', type: 'string', label: 'Métrica', required: false },
      { key: 'period', type: 'string', label: 'Período', required: false },
    ],
    domainService: 'AnalyticsService.get',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'get_billing_status',
    title: 'Status faturamento',
    description: 'Mostra status de faturamento e plano',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'BillingService.status',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'get_settings',
    title: 'Configurações',
    description: 'Mostra configurações do workspace',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'WorkspaceService.getSettings',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'get_wallet_balance',
    title: 'Saldo da carteira',
    description: 'Mostra saldo disponível, pendente e total',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'WalletService.getBalance',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'get_wallet_statement',
    title: 'Extrato da carteira',
    description: 'Mostra extrato de transações',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'WalletService.getStatement',
    emits: [],
    surface: ['dashboard-chat'],
  },
];
