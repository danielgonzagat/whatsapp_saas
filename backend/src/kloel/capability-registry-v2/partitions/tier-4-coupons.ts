import { type CapabilityDefinition } from '../capability-registry-v2.types';

/**
 * KLOEL CAPABILITY REGISTRY partition — Tier 4 (coupons).
 *
 * Extracted from capability-registry-v2.const.ts.
 * Consumers should import CAPABILITY_DEFINITIONS from the barrel
 * '../capability-registry-v2.const' rather than this partition directly.
 */
export const TIER_4_COUPONS_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'list_coupons',
    title: 'Listar cupons',
    description: 'Lista cupons de desconto',
    category: 'QUERY',
    tier: 4,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: 'CouponService.list',
    emits: [],
    surface: ['dashboard-chat'],
  },
  {
    id: 'create_coupon',
    title: 'Criar cupom',
    description: 'Cria novo cupom de desconto',
    category: 'MUTATION_SAFE',
    tier: 4,
    requiresConfirmation: true,
    requiredPermissions: ['product:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'code', type: 'string', label: 'Código', required: true },
      {
        key: 'discountType',
        type: 'select',
        label: 'Tipo',
        required: true,
        enum: ['percentage', 'fixed'],
      },
      { key: 'discountValue', type: 'number', label: 'Valor', required: true },
    ],
    domainService: 'CouponService.create',
    emits: ['coupon.created'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'update_coupon',
    title: 'Atualizar cupom',
    description: 'Atualiza dados de um cupom',
    category: 'MUTATION_SAFE',
    tier: 4,
    requiresConfirmation: false,
    requiredPermissions: ['product:write'],
    inputSchema: [{ key: 'couponId', type: 'string', label: 'Cupom', required: true }],
    domainService: 'CouponService.update',
    emits: ['coupon.updated'],
    surface: ['dashboard-chat'],
  },
  {
    id: 'coupons.create',
    title: 'Criar cupom',
    description: 'Cria cupom de desconto para um produto',
    category: 'MUTATION_SAFE',
    tier: 4,
    requiresConfirmation: true,
    requiredPermissions: ['product:write'],
    inputSchema: [
      { key: 'productId', type: 'string', label: 'Produto', required: true },
      { key: 'code', type: 'string', label: 'Código', required: true, prompt: 'Código do cupom?' },
      {
        key: 'discountType',
        type: 'select',
        label: 'Tipo',
        required: true,
        enum: ['percentage', 'fixed'],
      },
      { key: 'discountValue', type: 'number', label: 'Valor', required: true },
      { key: 'usageLimit', type: 'number', label: 'Limite de usos', required: false },
    ],
    domainService: 'CouponService.create',
    emits: ['coupon.created'],
    evidenceUrlBuilder: '/produtos/${productId}/cupons/${couponId}',
    surface: ['dashboard-chat'],
  },
  {
    id: 'coupons.delete',
    title: 'Excluir cupom',
    description: 'Remove um cupom de desconto',
    category: 'MUTATION_SAFE',
    tier: 4,
    requiresConfirmation: true,
    requiredPermissions: ['product:write'],
    inputSchema: [{ key: 'couponId', type: 'string', label: 'ID do cupom', required: true }],
    domainService: 'CouponService.delete',
    emits: ['coupon.deleted'],
    surface: ['dashboard-chat'],
  },
];
