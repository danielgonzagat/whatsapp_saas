import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 6 (urls).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_6_URLS_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'add_url',
    title: 'Adicionar URL',
    description: 'Adiciona URL ao produto',
    category: 'MUTATION_SAFE',
    tier: 6,
    requiresConfirmation: false,
    requiredPermissions: ['product:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'url', type: 'string', label: 'URL', required: true },
    ],
    domainService: 'ProductUrlService.add',
    emits: ['product.url_added'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'update_url',
    title: 'Editar URL',
    description: 'Edita URL de um produto',
    category: 'MUTATION_SAFE',
    tier: 6,
    requiresConfirmation: false,
    requiredPermissions: ['product:write'],
    inputSchema: [{ key: 'urlId', type: 'string', label: 'ID da URL', required: true }],
    domainService: 'ProductUrlService.update',
    emits: ['product.url_updated'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'delete_url',
    title: 'Remover URL',
    description: 'Remove URL de um produto',
    category: 'MUTATION_SAFE',
    tier: 6,
    requiresConfirmation: true,
    requiredPermissions: ['product:write'],
    inputSchema: [{ key: 'urlId', type: 'string', label: 'ID da URL', required: true }],
    domainService: 'ProductUrlService.delete',
    emits: ['product.url_deleted'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'urls.add',
    title: 'Adicionar URL',
    description: 'Adiciona URL (página de venda, landing page) a um produto',
    category: 'MUTATION_SAFE',
    tier: 6,
    requiresConfirmation: false,
    requiredPermissions: ['product:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'url', type: 'string', label: 'URL', required: true },
      { key: 'description', type: 'string', label: 'Descrição', required: true },
    ],
    domainService: 'ProductUrlService.add',
    emits: ['product.url_added'],
    surface: ['dashboard-chat'],
  },
];
