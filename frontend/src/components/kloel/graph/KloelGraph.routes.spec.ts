import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

describe('KloelGraph route contract', () => {
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

  it('keeps split graph modules under the architecture guard line budget', () => {
    const graphModules = [
      'KloelGraph.routes.ts',
      'KloelGraph.static-nodes.ts',
      'KloelGraph.product-nodes.ts',
      'KloelGraphShell.tsx',
      'KloelGraphShell.helpers.ts',
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
    expect(
      resolveKloelGraphNodeForPath('/analytics', new URLSearchParams('tab=abandonos'))?.id,
    ).toBe('consultar-report-abandonos');
  });

  it('exposes stable nodes for graph rendering and deep-link focus', () => {
    expect(getKloelGraphNodeById('kloel')?.route).toBe('/chat');
    expect(getKloelGraphNodeById('kloel-chat')?.label).toBe('Novo Chat');
    expect(getKloelGraphNodeById('kloel-search')?.route).toBe('/chat?graphAction=search');
    expect(getKloelGraphNodeById('kloel-images')?.route).toBe('/chat?graphAction=images');
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
        name: 'GHK-CU',
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
});
