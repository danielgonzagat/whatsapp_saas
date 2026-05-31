import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 8 (marketplace).
 *
 * Marketplace capabilities: listing public products, browsing the marketplace,
 * applying as an affiliate, and obtaining affiliate links.
 *
 * The legacy `browse_marketplace` (formerly in tier-8-crm.ts) is deprecated
 * here and superseded by `marketplace.list` which maps to `MarketplaceService.list`.
 *
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_8_MARKETPLACE_CAPABILITIES: CapabilityDefinition[] = [
  // ── Canonical (dotted) IDs ──
  {
    id: 'marketplace.list',
    title: 'Explorar marketplace',
    description: 'Lista produtos públicos disponíveis para afiliação no marketplace',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [
      { key: 'category', type: 'string', label: 'Categoria', required: false },
      { key: 'search', type: 'string', label: 'Busca', required: false },
      { key: 'limit', type: 'number', label: 'Limite', required: false },
    ],
    domainService: 'MarketplaceService.list',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'marketplace.install_template',
    title: 'Instalar template do marketplace',
    description: 'Instala um template (fluxo/produto) do marketplace no workspace',
    category: 'MUTATION_SAFE',
    tier: 8,
    requiresConfirmation: true,
    requiredPermissions: ['workspace:write'],
    inputSchema: [{ key: 'templateId', type: 'string', label: 'ID do template', required: true }],
    domainService: 'MarketplaceService.installTemplate',
    emits: ['marketplace.template_installed'],
    surface: ['dashboard-chat'],
  },
  // ── Legacy IDs (deprecated) — superseded by canonical dotted equivalents ──
  {
    id: 'browse_marketplace',
    title: 'Explorar marketplace (legado)',
    description: 'DEPRECATED — use marketplace.list',
    category: 'QUERY',
    tier: 8,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'MarketplaceService.list',
    emits: [],
    surface: ['dashboard-chat'],
    maturity: 'deprecated',
    dependsOn: ['marketplace.list'],
  },
];
