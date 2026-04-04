import { describe, expect, it } from 'vitest';

import {
  buildDashboardHref,
  buildDashboardSourceHref,
  buildDashboardContextPrompt,
  readDashboardContextFromMetadata,
  summarizeDashboardContext,
} from '@/lib/kloel-dashboard-context';

describe('kloel dashboard context', () => {
  it('builds dashboard href with conversation and commercial context', () => {
    expect(
      buildDashboardHref({
        conversationId: 'conv_123',
        source: 'checkout',
        productId: 'prod_1',
        productName: 'Oferta Premium',
        planId: 'plan_9',
        checkoutSlug: 'oferta-premium',
        purpose: 'recovery',
      }),
    ).toBe(
      '/?conversationId=conv_123&source=checkout&productId=prod_1&productName=Oferta+Premium&planId=plan_9&checkoutSlug=oferta-premium&purpose=recovery',
    );
  });

  it('reads metadata from wrapped and raw payloads', () => {
    expect(
      readDashboardContextFromMetadata({
        dashboardContext: { source: 'leads', phone: '5511999999999' },
      }),
    ).toEqual({
      source: 'leads',
      phone: '5511999999999',
      sourceLabel: 'Leads',
    });

    expect(
      readDashboardContextFromMetadata({
        source: 'pricing',
        draft: 'Quero assinar agora',
      }),
    ).toEqual({
      source: 'pricing',
      draft: 'Quero assinar agora',
      sourceLabel: 'Pricing',
    });
  });

  it('builds source return hrefs for active operational shells', () => {
    expect(
      buildDashboardSourceHref({
        source: 'leads',
        leadId: 'lead_1',
        phone: '5511999999999',
      }),
    ).toBe('/leads?leadId=lead_1&phone=5511999999999');

    expect(
      buildDashboardSourceHref({
        source: 'checkout',
        planId: 'plan_9',
      }),
    ).toBe('/checkout/plan_9');

    expect(
      buildDashboardSourceHref({
        source: 'checkout',
        planId: 'plan_9',
        checkoutSlug: 'oferta-premium',
      }),
    ).toBe('/oferta-premium');

    expect(
      buildDashboardSourceHref({
        source: 'pricing',
      }),
    ).toBe('/pricing');
  });

  it('specializes prompt copy for pricing and landing contexts', () => {
    expect(
      buildDashboardContextPrompt({
        source: 'pricing',
      }),
    ).toContain('concluir o plano ideal');

    expect(
      buildDashboardContextPrompt({
        source: 'landing',
      }),
    ).toContain('transformar curiosidade em próximo passo');
  });

  it('handles null context values without throwing', () => {
    expect(buildDashboardHref(null)).toBe('/');
    expect(buildDashboardSourceHref(null)).toBeNull();
    expect(summarizeDashboardContext(null)).toEqual([]);
    expect(buildDashboardContextPrompt(null)).toContain('próxima melhor ação');
  });
});
