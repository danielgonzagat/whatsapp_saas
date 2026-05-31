import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 8 (crm).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 *
 * Note: Marketplace capabilities (browse_marketplace / marketplace.*) have been
 * moved to tier-8-marketplace.ts to keep CRM and Marketplace concerns separate.
 */
export const TIER_8_CRM_CAPABILITIES: CapabilityDefinition[] = [
  // ── Canonical (dotted) IDs ──
  {
    id: 'crm.pipeline',
    title: 'Pipeline CRM',
    description: 'Mostra o pipeline CRM com estágios e leads',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'CrmService.getPipeline',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'crm.get_lead',
    title: 'Detalhes do lead',
    description: 'Mostra detalhes de um lead',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [{ key: 'leadId', type: 'string', label: 'Lead', required: true }],
    domainService: 'LeadService.get',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'sales.list',
    title: 'Listar vendas',
    description: 'Lista as vendas do workspace',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      {
        key: 'status',
        type: 'select',
        label: 'Status',
        required: false,
        enum: ['pending', 'paid', 'cancelled', 'refunded'],
      },
      { key: 'limit', type: 'number', label: 'Quantidade', required: false },
    ],
    domainService: 'OrderService.list',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'sales.fill_buyer_data',
    title: 'Preencher dados do comprador',
    description: 'Coleta e preenche os dados do comprador para uma venda',
    category: 'MUTATION_SENSITIVE',
    tier: 8,
    requiresConfirmation: true,
    requiredPermissions: ['sale:write'],
    inputSchema: [
      { key: 'saleId', type: 'string', label: 'Venda', required: true },
      { key: 'customerName', type: 'string', label: 'Nome', required: true },
      { key: 'customerEmail', type: 'string', label: 'Email', required: true },
      { key: 'customerCpf', type: 'string', label: 'CPF', required: false },
      { key: 'customerPhone', type: 'string', label: 'Telefone', required: false },
    ],
    domainService: 'SalesService.fillBuyerData',
    emits: ['buyer.data_filled'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'subscriptions.update',
    title: 'Gerenciar assinatura',
    description: 'Cancela ou pausa uma assinatura',
    category: 'MUTATION_SENSITIVE',
    tier: 8,
    requiresConfirmation: true,
    requiredPermissions: ['subscription:write'],
    inputSchema: [
      { key: 'subscriptionId', type: 'string', label: 'ID da assinatura', required: false },
    ],
    domainService: 'SubscriptionService.update',
    emits: ['subscription.updated'],
    surface: ['dashboard-chat'],
  },
  // ── Legacy IDs (deprecated) — superseded by canonical dotted equivalents ──
  {
    id: 'update_subscription',
    title: 'Gerenciar assinatura (legado)',
    description: 'DEPRECATED — use subscriptions.update',
    category: 'MUTATION_SENSITIVE',
    tier: 8,
    requiresConfirmation: true,
    requiredPermissions: ['subscription:write'],
    inputSchema: [
      { key: 'subscriptionId', type: 'string', label: 'ID da assinatura', required: false },
    ],
    domainService: 'SubscriptionService.update',
    emits: ['subscription.updated'],
    surface: ['dashboard-chat'],
    maturity: 'deprecated',
    dependsOn: ['subscriptions.update'],
  },
  {
    id: 'get_lead_details',
    title: 'Detalhes do lead (legado)',
    description: 'DEPRECATED — use crm.get_lead',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [{ key: 'leadId', type: 'string', label: 'Lead', required: true }],
    domainService: 'LeadService.get',
    emits: [],
    surface: ['dashboard-chat'],
    maturity: 'deprecated',
    dependsOn: ['crm.get_lead'],
  },
];
