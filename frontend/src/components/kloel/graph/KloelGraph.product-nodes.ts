import type {
  KloelGraphEntityLike,
  KloelGraphNode,
  KloelGraphProductLike,
} from './KloelGraph.routes';

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

export function buildKloelGraphProductNodes(
  products: readonly KloelGraphProductLike[] | undefined,
): KloelGraphNode[] {
  return (products ?? []).flatMap((product) => buildProductGraphNodeSet(product));
}

function buildProductGraphNodeSet(product: KloelGraphProductLike): KloelGraphNode[] {
  const productId = resolveGraphEntityId(product);
  if (!productId) {
    return [];
  }
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
    overlayLabel: label,
  };
  return [
    productNode,
    ...PRODUCT_GRAPH_TABS.map((tab) => ({
      id: `${productNodeId}-${tab.id}`,
      label: tab.label,
      area: 'criar' as const,
      type: 'entity' as const,
      route: `/products/${encodedProductId}?tab=${tab.id}`,
      parentId: productNodeId,
      subtitle: `${label} - ${tab.label}`,
      overlayLabel: `${label} - ${tab.label}`,
    })),
    ...buildPlanGraphNodes(product, productNodeId, productId, label, encodedProductId),
    ...buildCheckoutGraphNodes(product, productNodeId, productId, label),
  ];
}

function buildPlanGraphNodes(
  product: KloelGraphProductLike,
  productNodeId: string,
  productId: string,
  label: string,
  encodedProductId: string,
): KloelGraphNode[] {
  return collectGraphEntities(product.checkoutPlans, product.plans).flatMap((plan) => {
    const planId = resolveGraphEntityId(plan);
    if (!planId) {
      return [];
    }
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
      checkoutGraphNode(
        checkoutNodeId,
        'Checkout',
        planId,
        productId,
        label,
        planNodeId,
        planLabel,
      ),
      orderBumpGraphNode(checkoutNodeId, planId, productId, label),
    ];
  });
}

function buildCheckoutGraphNodes(
  product: KloelGraphProductLike,
  productNodeId: string,
  productId: string,
  label: string,
): KloelGraphNode[] {
  return collectGraphEntities(product.checkoutTemplates, product.checkouts).flatMap((checkout) => {
    const checkoutId = resolveGraphEntityId(checkout);
    if (!checkoutId) {
      return [];
    }
    const checkoutLabel = resolveGraphEntityLabel(checkout, 'Checkout');
    const checkoutNodeId = `${productNodeId}-checkout-${checkoutId}`;
    return [
      checkoutGraphNode(
        checkoutNodeId,
        checkoutLabel,
        checkoutId,
        productId,
        label,
        `${productNodeId}-checkouts`,
        ['Checkout', describeGraphEntityStatus(checkout)].filter(Boolean).join(' - '),
      ),
      orderBumpGraphNode(checkoutNodeId, checkoutId, productId, label),
    ];
  });
}

function checkoutGraphNode(
  id: string,
  label: string,
  checkoutId: string,
  productId: string,
  productLabel: string,
  parentId: string,
  subtitle: string,
): KloelGraphNode {
  return {
    id,
    label,
    area: 'criar',
    type: 'entity',
    route: buildCheckoutEditorRoute(checkoutId, productId, productLabel, 'checkout-appearance'),
    parentId,
    subtitle,
    overlayLabel: 'Checkout',
  };
}

function orderBumpGraphNode(
  checkoutNodeId: string,
  checkoutId: string,
  productId: string,
  productLabel: string,
): KloelGraphNode {
  return {
    id: `${checkoutNodeId}-order-bump`,
    label: 'Order Bump',
    area: 'criar',
    type: 'entity',
    route: buildCheckoutEditorRoute(checkoutId, productId, productLabel, 'order-bump'),
    parentId: checkoutNodeId,
    subtitle: 'Dentro do checkout',
    overlayLabel: 'Checkout',
  };
}

function collectGraphEntities(
  ...groups: Array<readonly KloelGraphEntityLike[] | null | undefined>
): KloelGraphEntityLike[] {
  const seen = new Set<string>();
  const entities: KloelGraphEntityLike[] = [];
  for (const group of groups) {
    for (const entity of group ?? []) {
      const id = resolveGraphEntityId(entity);
      if (!id || seen.has(id)) {
        continue;
      }
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
    String(
      entity.name ||
        entity.label ||
        entity.title ||
        entity.referenceCode ||
        entity.slug ||
        fallback,
    ).trim() || fallback
  );
}

function describeGraphEntityStatus(entity: KloelGraphEntityLike): string | null {
  if (entity.active === false || entity.isActive === false) {
    return 'inativo';
  }
  if (entity.active === true || entity.isActive === true) {
    return 'ativo';
  }
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
