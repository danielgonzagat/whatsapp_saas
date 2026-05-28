import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 7 (affiliates).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_7_AFFILIATES_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'get_affiliate_config',
    title: 'Configuração de afiliados',
    description: 'Mostra configuração do programa de afiliados',
    category: 'QUERY',
    tier: 7,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'AffiliateService.getConfig',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'update_affiliate_config',
    title: 'Atualizar afiliados',
    description: 'Atualiza configuração do programa de afiliados',
    category: 'MUTATION_SAFE',
    tier: 7,
    requiresConfirmation: true,
    requiredPermissions: ['affiliate:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'commissionPercent', type: 'number', label: 'Comissão %', required: false },
    ],
    domainService: 'AffiliateService.configure',
    emits: ['affiliate.program_updated'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'list_affiliates',
    title: 'Listar afiliados',
    description: 'Lista afiliados do programa',
    category: 'QUERY',
    tier: 7,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'AffiliateService.list',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'affiliates.configure',
    title: 'Configurar afiliados',
    description: 'Ativa/desativa e configura o programa de afiliados do produto',
    category: 'MUTATION_SAFE',
    tier: 7,
    requiresConfirmation: true,
    requiredPermissions: ['affiliate:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'enabled', type: 'boolean', label: 'Ativar programa?', required: true },
      { key: 'commissionPercent', type: 'number', label: 'Comissão (%)', required: false },
    ],
    domainService: 'AffiliateService.configure',
    emits: ['affiliate.program_updated'],
    surface: ['dashboard-chat'],
  },
];
