import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { swrFetcher } from '@/lib/fetcher';

import {
  KLOEL_GRAPH_NODES,
  KLOEL_GRAPH_PRIMARY_NODES,
  PRODUCT_GRAPH_TABS,
  buildKloelGraphProductNodes,
  getKloelGraphNodeById,
  isKloelGraphEnabled,
  resolveKloelGraphNodeForPath,
  resolveKloelGraphNodeForPathFromNodes,
  resolveKloelGraphRoute,
} from './KloelGraph.routes';
import {
  buildKloelGraphMemberAreaNodes,
  loadCheckoutGraphProducts,
  mergeGraphProducts,
} from './KloelGraphShell.helpers';

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

const swrFetcherMock = vi.mocked(swrFetcher);

describe('KloelGraph route contract', () => {
  beforeEach(() => {
    swrFetcherMock.mockReset();
  });

  it('does not synthesize product nodes when real product sources are empty', () => {
    const staticLabels = KLOEL_GRAPH_NODES.map((node) => node.label.toLowerCase());

    expect(staticLabels).not.toContain('ghk-cu');
    expect(staticLabels).not.toContain('pdrn');
    expect(mergeGraphProducts(undefined, undefined)).toEqual([]);
    expect(buildKloelGraphProductNodes(mergeGraphProducts([], []))).toEqual([]);
  });

  it('keeps the seven canonical primary galaxies from the prototype', () => {
    expect(KLOEL_GRAPH_PRIMARY_NODES.map((node) => node.label)).toEqual([
      'Perfil',
      'Kloel',
      'Criar',
      'Afiliar',
      'Educar',
      'Conversar',
      'Consultar',
    ]);
  });

  it('opens the Consultar primary galaxy on real analytics reports instead of wallet balance', () => {
    const consultar = KLOEL_GRAPH_PRIMARY_NODES.find((node) => node.id === 'consultar');

    expect(consultar?.route).toBe('/analytics?tab=vendas');
    expect(resolveKloelGraphRoute('consultar')).toBe('/analytics?tab=vendas');
    expect(resolveKloelGraphNodeForPath('/analytics', new URLSearchParams('tab=vendas'))?.area).toBe(
      'consultar',
    );
    expect(resolveKloelGraphRoute('consultar-payments')).toBe('/carteira');
    expect(resolveKloelGraphNodeForPath('/carteira', new URLSearchParams())?.id).toBe(
      'consultar-payments',
    );
  });

  it('keeps split graph modules under the architecture guard line budget', () => {
    const graphModules = [
      'KloelGraph.routes.ts',
      'KloelGraph.static-nodes.ts',
      'KloelGraph.product-nodes.ts',
      'KloelGraphShell.tsx',
      'KloelGraphShell.helpers.ts',
      'KloelGraphPendingOverlay.tsx',
      'KloelGraphNodeButton.tsx',
      'KloelGraphFloatingNav.tsx',
      'KloelGraphOverlay.tsx',
    ];

    for (const moduleName of graphModules) {
      const source = readFileSync(fileURLToPath(new URL(moduleName, import.meta.url)), 'utf8');
      expect(source.split('\n').length, moduleName).toBeLessThanOrEqual(400);
    }
  });

  it('keeps the graph enabled by default and reserves explicit false values for rollback', () => {
    expect(isKloelGraphEnabled(undefined)).toBe(true);
    expect(isKloelGraphEnabled(null)).toBe(true);
    expect(isKloelGraphEnabled('')).toBe(true);
    expect(isKloelGraphEnabled('true')).toBe(true);
    expect(isKloelGraphEnabled('1')).toBe(true);
    expect(isKloelGraphEnabled('on')).toBe(true);
    expect(isKloelGraphEnabled('false')).toBe(false);
    expect(isKloelGraphEnabled('0')).toBe(false);
    expect(isKloelGraphEnabled('off')).toBe(false);
  });

  it('maps legacy product routes to graph nodes without changing the real screen route', () => {
    expect(resolveKloelGraphNodeForPath('/products', new URLSearchParams())?.id).toBe(
      'criar-products',
    );
    expect(resolveKloelGraphNodeForPath('/products/new', new URLSearchParams())?.id).toBe(
      'criar-new-product',
    );
    expect(resolveKloelGraphNodeForPath('/products/prod_123', new URLSearchParams())?.id).toBe(
      'criar-product',
    );
    expect(resolveKloelGraphRoute('criar')).toBe('/products');
  });

  it('opens Conta on the canonical settings route without the legacy account redirect', () => {
    expect(resolveKloelGraphRoute('perfil-account')).toBe('/settings');
    expect(resolveKloelGraphRoute('perfil-account')).not.toBe('/account');
    expect(resolveKloelGraphNodeForPath('/settings', new URLSearchParams())?.area).toBe('perfil');
  });

  it('resolves Perfil language settings to the dedicated Idiomas graph node', () => {
    const idiomasNode = resolveKloelGraphNodeForPath(
      '/settings',
      new URLSearchParams('section=idiomas'),
    );

    expect(idiomasNode?.id).toBe('perfil-settings-idiomas');
    expect(idiomasNode?.overlayLabel).toBe('Idiomas');
    expect(resolveKloelGraphRoute('perfil-settings-idiomas')).toBe('/settings?section=idiomas');
  });

  it('keeps Sites subroutes attached to the Sites graph overlay label', () => {
    expect(resolveKloelGraphNodeForPath('/sites/criar', new URLSearchParams())?.id).toBe(
      'criar-sites',
    );
    expect(
      resolveKloelGraphNodeForPathFromNodes(
        '/sites/editar',
        new URLSearchParams(),
        KLOEL_GRAPH_NODES,
      )?.id,
    ).toBe('criar-sites');
  });

  it('maps affiliate, member area, channel, inbox, wallet, and reports routes', () => {
    expect(resolveKloelGraphNodeForPath('/produtos/afiliar-se', new URLSearchParams())?.id).toBe(
      'afiliar-marketplace',
    );
    expect(resolveKloelGraphNodeForPath('/produtos/area-membros', new URLSearchParams())?.id).toBe(
      'educar-area-membros',
    );
    expect(resolveKloelGraphNodeForPath('/marketing/whatsapp', new URLSearchParams())?.id).toBe(
      'conectar-channel-whatsapp',
    );
    expect(resolveKloelGraphNodeForPath('/inbox', new URLSearchParams())?.id).toBe(
      'conectar-inbox',
    );
    expect(getKloelGraphNodeById('conectar-autopilot')?.parentId).toBe('conectar-crm');
    expect(resolveKloelGraphNodeForPath('/carteira/saques', new URLSearchParams())?.id).toBe(
      'consultar-wallet-saques',
    );
    expect(getKloelGraphNodeById('consultar-wallet-movimentacoes')).toBeUndefined();
    expect(
      resolveKloelGraphNodeForPath('/analytics', new URLSearchParams('tab=abandonos'))?.id,
    ).toBe('consultar-report-abandonos');
  });

  it('uses contextual Conversar labels for duplicated channel surfaces', () => {
    expect(getKloelGraphNodeById('conectar-whatsapp')?.label).toBe('WhatsApp');
    expect(getKloelGraphNodeById('conectar-channel-whatsapp')?.label).toBe('Marketing WhatsApp');
    expect(getKloelGraphNodeById('conectar-channel-google-ads')?.label).toBe(
      'Marketing Google Ads',
    );
    expect(getKloelGraphNodeById('conectar-channel-tiktok')?.label).toBe('Marketing TikTok');
    expect(getKloelGraphNodeById('conectar-anuncios-tiktok')?.label).toBe('TikTok Ads');

    const conversarLabels = KLOEL_GRAPH_NODES.filter((node) => node.area === 'conectar').map(
      (node) => node.label,
    );

    expect(conversarLabels.filter((label) => label === 'Whatsapp')).toHaveLength(0);
    expect(conversarLabels.filter((label) => label === 'Tiktok')).toHaveLength(0);
    expect(conversarLabels.filter((label) => label === 'Google Ads')).toHaveLength(1);
  });

  it('exposes dashboard metric nodes that open real report and wallet screens', () => {
    const metricNodes = KLOEL_GRAPH_NODES.filter((node) => node.parentId === 'dashboard');

    expect(metricNodes.map((node) => [node.id, node.type, node.route])).toEqual([
      [
        'dashboard-metric-total-revenue',
        'metric',
        '/analytics?tab=vendas&graphMetric=total-revenue',
      ],
      [
        'dashboard-metric-month-revenue',
        'metric',
        '/analytics?tab=vendas&graphMetric=month-revenue',
      ],
      [
        'dashboard-metric-today-revenue',
        'metric',
        '/analytics?tab=vendas&graphMetric=today-revenue',
      ],
      [
        'dashboard-metric-available-balance',
        'metric',
        '/carteira/saldo?graphMetric=available-balance',
      ],
      ['dashboard-metric-pending-balance', 'metric', '/carteira/saldo?graphMetric=pending-balance'],
      ['dashboard-metric-revenue', 'metric', '/analytics?tab=vendas&graphMetric=revenue'],
      ['dashboard-metric-sales', 'metric', '/analytics?tab=vendas&graphMetric=sales'],
      ['dashboard-metric-conversion', 'metric', '/analytics?tab=metricas&graphMetric=conversion'],
      [
        'dashboard-metric-average-ticket',
        'metric',
        '/analytics?tab=metricas&graphMetric=average-ticket',
      ],
    ]);
    expect(
      resolveKloelGraphNodeForPath(
        '/analytics',
        new URLSearchParams('tab=vendas&graphMetric=sales'),
      )?.id,
    ).toBe('dashboard-metric-sales');
    expect(resolveKloelGraphNodeForPath('/analytics', new URLSearchParams('tab=vendas'))?.id).toBe(
      'consultar-report-vendas',
    );
  });

  it('exposes stable nodes for graph rendering and deep-link focus', () => {
    expect(getKloelGraphNodeById('kloel')?.route).toBe('/chat');
    expect(getKloelGraphNodeById('kloel-chat')?.label).toBe('Novo Chat');
    expect(getKloelGraphNodeById('kloel-search')?.route).toBe('/chat?graphAction=search');
    expect(getKloelGraphNodeById('kloel-recents')?.route).toBe('/chat?graphAction=recents');
    expect(
      resolveKloelGraphNodeForPath('/chat', new URLSearchParams('graphAction=recents'))?.id,
    ).toBe('kloel-recents');
    expect(getKloelGraphNodeById('consultar-report-estornos')?.route).toBe(
      '/analytics?tab=estornos',
    );
  });

  it('derives product, tab, plan, checkout, and order-bump nodes from live products', () => {
    const productNodes = buildKloelGraphProductNodes([
      {
        id: 'prod_123',
        name: 'Produto real',
        category: 'Dermocosmeticos',
        status: 'active',
        plans: [{ id: 'plan_1', name: 'Plano principal', active: true }],
        checkouts: [{ id: 'checkout_1', name: 'Checkout principal', active: true }],
      },
    ]);
    const allNodes = [...KLOEL_GRAPH_NODES, ...productNodes];

    expect(productNodes).toHaveLength(1 + PRODUCT_GRAPH_TABS.length + 3 + 2);
    expect(productNodes.find((node) => node.id === 'criar-product-prod_123')?.route).toBe(
      '/products/prod_123',
    );
    expect(productNodes.find((node) => node.id === 'criar-product-prod_123-cupons')?.route).toBe(
      '/products/prod_123?tab=cupons',
    );
    expect(productNodes.find((node) => node.id === 'criar-product-prod_123')?.overlayLabel).toBe(
      'Produto real',
    );
    expect(productNodes.find((node) => node.id === 'criar-product-prod_123-cupons')?.overlayLabel).toBe(
      'Produto real - Cupons',
    );
    expect(
      productNodes.find((node) => node.id === 'criar-product-prod_123-plan-plan_1')?.route,
    ).toBe('/products/prod_123/plans/plan_1');
    expect(
      productNodes.find((node) => node.id === 'criar-product-prod_123-plan-plan_1-checkout')?.route,
    ).toContain('/checkout/plan_1?');
    expect(
      productNodes.find(
        (node) => node.id === 'criar-product-prod_123-checkout-checkout_1-order-bump',
      )?.route,
    ).toContain('focus=order-bump');
    expect(
      resolveKloelGraphNodeForPathFromNodes(
        '/products/prod_123',
        new URLSearchParams('tab=cupons'),
        allNodes,
      )?.id,
    ).toBe('criar-product-prod_123-cupons');
    expect(
      resolveKloelGraphNodeForPathFromNodes(
        '/products/prod_123/plans/plan_1',
        new URLSearchParams(),
        allNodes,
      )?.id,
    ).toBe('criar-product-prod_123-plan-plan_1');
    expect(
      resolveKloelGraphNodeForPathFromNodes(
        '/checkout/plan_1',
        new URLSearchParams('productId=prod_123&focus=order-bump'),
        allNodes,
      )?.id,
    ).toBe('criar-product-prod_123-plan-plan_1-checkout-order-bump');
  });

  it('routes checkout-backed plans to the checkout editor instead of the legacy product-plan endpoint', () => {
    const productNodes = buildKloelGraphProductNodes([
      {
        id: 'prod_123',
        name: 'Produto real',
        checkoutPlans: [{ id: 'checkout_plan_1', name: 'Plano Checkout', active: true }],
        plans: [],
      },
    ]);

    expect(
      productNodes.some((node) => node.route === '/products/prod_123/plans/checkout_plan_1'),
    ).toBe(false);
    expect(
      productNodes.find((node) => node.id === 'criar-product-prod_123-checkout-checkout_plan_1')
        ?.route,
    ).toContain('/checkout/checkout_plan_1?');
    expect(
      productNodes.find(
        (node) => node.id === 'criar-product-prod_123-checkout-checkout_plan_1-order-bump',
      )?.route,
    ).toContain('focus=order-bump');
  });

  it('derives member area nodes from live member areas and resolves their deep-link focus', () => {
    const memberAreaNodes = buildKloelGraphMemberAreaNodes([
      { id: 'area_123', name: 'Curso real', description: 'Area conectada', active: true },
      { name: 'Sem id' },
    ]);
    const allNodes = [...KLOEL_GRAPH_NODES, ...memberAreaNodes];

    expect(memberAreaNodes).toEqual([
      {
        id: 'educar-member-area-area_123',
        label: 'Curso real',
        area: 'educar',
        type: 'entity',
        route: '/produtos/area-membros/preview/area_123',
        parentId: 'educar-area-membros',
        subtitle: 'Area conectada - ativa',
        overlayLabel: 'Area de membros',
      },
    ]);
    expect(
      resolveKloelGraphNodeForPathFromNodes(
        '/produtos/area-membros/preview/area_123',
        new URLSearchParams(),
        allNodes,
      )?.id,
    ).toBe('educar-member-area-area_123');
  });

  it('keeps checkout detail plans out of legacy product-plan routes', async () => {
    swrFetcherMock
      .mockResolvedValueOnce([{ id: 'checkout_prod_real', name: 'Produto real' }])
      .mockResolvedValueOnce({
        plans: [{ id: 'checkout_plan_1', name: 'Plano Checkout', active: true }],
        checkouts: [{ id: 'checkout_template_1', name: 'Checkout Principal', active: true }],
      });

    await expect(loadCheckoutGraphProducts()).resolves.toEqual([
      {
        id: 'checkout_prod_real',
        name: 'Produto real',
        label: 'Produto real',
        slug: null,
        plans: [],
        checkoutPlans: [{ id: 'checkout_plan_1', name: 'Plano Checkout', active: true }],
        checkouts: [{ id: 'checkout_template_1', name: 'Checkout Principal', active: true }],
      },
    ]);
  });

  it('keeps real checkout products visible when detail payload fetch fails', async () => {
    swrFetcherMock
      .mockResolvedValueOnce([
        { id: 'checkout_prod_real', name: 'Produto real', slug: 'produto-real' },
      ])
      .mockRejectedValueOnce(new Error('checkout detail unavailable'));

    await expect(loadCheckoutGraphProducts()).resolves.toEqual([
      {
        id: 'checkout_prod_real',
        name: 'Produto real',
        label: 'Produto real',
        slug: 'produto-real',
        plans: [],
        checkoutPlans: [],
        checkouts: [],
      },
    ]);
    expect(swrFetcherMock).toHaveBeenNthCalledWith(1, '/checkout/products');
    expect(swrFetcherMock).toHaveBeenNthCalledWith(2, '/checkout/products/checkout_prod_real');
  });

  it('keeps checkout graph enrichment bounded while preserving base product nodes', async () => {
    const checkoutProducts = Array.from({ length: 14 }, (_, index) => ({
      id: `checkout_prod_${index}`,
      name: `Produto ${index}`,
    }));

    swrFetcherMock.mockImplementation(async (url) => {
      if (url === '/checkout/products') {
        return checkoutProducts;
      }
      const productId = String(url).split('/').at(-1) ?? 'unknown';
      return {
        checkouts: [{ id: `${productId}_checkout`, name: 'Checkout', active: true }],
      };
    });

    const result = await loadCheckoutGraphProducts();

    expect(result).toHaveLength(14);
    expect(swrFetcherMock).toHaveBeenCalledTimes(13);
    expect(result[11].checkouts).toEqual([
      { id: 'checkout_prod_11_checkout', name: 'Checkout', active: true },
    ]);
    expect(result[12].checkouts).toEqual([]);
    expect(result[13]).toMatchObject({ id: 'checkout_prod_13', name: 'Produto 13' });
  });
});
