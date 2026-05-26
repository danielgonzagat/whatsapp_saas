import { describe, expect, it } from 'vitest';

import {
  KLOEL_CHAT_ROUTE,
  buildDashboardContextMetadata,
  buildDashboardContextPrompt,
  buildDashboardHref,
  buildDashboardSourceHref,
  getDashboardSourceLabel,
  normalizeDashboardContext,
  readDashboardContextFromMetadata,
  summarizeDashboardContext,
} from '@/lib/kloel-dashboard-context';

// ── KLOEL_CHAT_ROUTE ──────────────────────────────────────────────────────────

describe('KLOEL_CHAT_ROUTE', () => {
  it('is the chat route constant', () => {
    expect(KLOEL_CHAT_ROUTE).toBe('/chat');
  });
});

// ── getDashboardSourceLabel ───────────────────────────────────────────────────

describe('getDashboardSourceLabel', () => {
  it('returns the label for known sources', () => {
    expect(getDashboardSourceLabel('home')).toBe('Home');
    expect(getDashboardSourceLabel('landing')).toBe('Landing');
    expect(getDashboardSourceLabel('leads')).toBe('Leads');
    expect(getDashboardSourceLabel('followups')).toBe('Follow-ups');
    expect(getDashboardSourceLabel('inbox')).toBe('Inbox');
    expect(getDashboardSourceLabel('marketing')).toBe('Marketing');
    expect(getDashboardSourceLabel('scrapers')).toBe('Scrapers');
    expect(getDashboardSourceLabel('flow')).toBe('Flow');
    expect(getDashboardSourceLabel('checkout')).toBe('Checkout');
    expect(getDashboardSourceLabel('pricing')).toBe('Pricing');
    expect(getDashboardSourceLabel('chat')).toBe('Chat');
  });

  it('is case insensitive', () => {
    expect(getDashboardSourceLabel('LEADS')).toBe('Leads');
    expect(getDashboardSourceLabel('Leads')).toBe('Leads');
    expect(getDashboardSourceLabel('CHECKOUT')).toBe('Checkout');
  });

  it('trims whitespace', () => {
    expect(getDashboardSourceLabel('  leads  ')).toBe('Leads');
  });

  it('returns "Operação" for unknown sources', () => {
    expect(getDashboardSourceLabel('unknown')).toBe('Operação');
    expect(getDashboardSourceLabel('')).toBe('Operação');
  });

  it('returns "Operação" for null/undefined', () => {
    expect(getDashboardSourceLabel(null)).toBe('Operação');
    expect(getDashboardSourceLabel(undefined)).toBe('Operação');
  });
});

// ── normalizeDashboardContext ─────────────────────────────────────────────────

describe('normalizeDashboardContext', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeDashboardContext(null)).toBeNull();
    expect(normalizeDashboardContext(undefined)).toBeNull();
  });

  it('returns normalized object even for empty input (sourceLabel always set)', () => {
    const result = normalizeDashboardContext({});
    expect(result).not.toBeNull();
    expect(result?.sourceLabel).toBe('Operação');
    expect(result?.source).toBeUndefined();
  });

  it('returns normalized object even when all values are empty strings', () => {
    const result = normalizeDashboardContext({
      source: '',
      leadId: '',
      phone: '',
    });

    expect(result).not.toBeNull();
    expect(result?.sourceLabel).toBe('Operação');
    expect(result?.source).toBeUndefined();
  });

  it('cleans and normalizes string values', () => {
    const result = normalizeDashboardContext({
      source: '  leads  ',
      phone: '  5511999999999  ',
      name: '\tJoão Silva\n',
    });

    expect(result).toEqual({
      source: 'leads',
      phone: '5511999999999',
      name: 'João Silva',
      sourceLabel: 'Leads',
    });
  });

  it('treats whitespace-only strings as undefined', () => {
    const result = normalizeDashboardContext({
      source: 'leads',
      phone: '   ',
      name: '',
    });

    expect(result).toEqual({
      source: 'leads',
      sourceLabel: 'Leads',
    });
  });

  it('sets sourceLabel from the normalized source', () => {
    const result = normalizeDashboardContext({ source: 'checkout' });
    expect(result?.sourceLabel).toBe('Checkout');
  });

  it('normalizes all fields from a complete input', () => {
    const result = normalizeDashboardContext({
      conversationId: 'conv-1',
      source: 'checkout',
      leadId: 'lead-1',
      phone: '5511999999999',
      email: 'test@example.com',
      name: 'João',
      productId: 'prod-1',
      productName: 'Premium',
      planId: 'plan-1',
      planName: 'Pro',
      checkoutSlug: 'premium-offer',
      draft: 'Quero comprar',
      purpose: 'recovery',
    });

    expect(result).toEqual({
      source: 'checkout',
      leadId: 'lead-1',
      phone: '5511999999999',
      email: 'test@example.com',
      name: 'João',
      productId: 'prod-1',
      productName: 'Premium',
      planId: 'plan-1',
      planName: 'Pro',
      checkoutSlug: 'premium-offer',
      draft: 'Quero comprar',
      purpose: 'recovery',
      sourceLabel: 'Checkout',
    });
  });
});

// ── buildDashboardContextMetadata ──────────────────────────────────────────────

describe('buildDashboardContextMetadata', () => {
  it('returns undefined for null/undefined input', () => {
    expect(buildDashboardContextMetadata(null)).toBeUndefined();
    expect(buildDashboardContextMetadata(undefined)).toBeUndefined();
  });

  it('wraps even empty context since sourceLabel is always set', () => {
    const result = buildDashboardContextMetadata({});
    expect(result).toBeDefined();
    expect(result?.dashboardContext.sourceLabel).toBe('Operação');
  });

  it('wraps normalized context in dashboardContext key', () => {
    const result = buildDashboardContextMetadata({
      source: 'leads',
      phone: '5511999999999',
    });

    expect(result).toEqual({
      dashboardContext: {
        source: 'leads',
        phone: '5511999999999',
        sourceLabel: 'Leads',
      },
    });
  });
});

// ── readDashboardContextFromMetadata ──────────────────────────────────────────

describe('readDashboardContextFromMetadata', () => {
  it('returns null for non-object values', () => {
    expect(readDashboardContextFromMetadata(null)).toBeNull();
    expect(readDashboardContextFromMetadata(undefined)).toBeNull();
    expect(readDashboardContextFromMetadata('string')).toBeNull();
    expect(readDashboardContextFromMetadata(42)).toBeNull();
    expect(readDashboardContextFromMetadata(true)).toBeNull();
  });

  it('reads from nested dashboardContext field', () => {
    expect(
      readDashboardContextFromMetadata({
        dashboardContext: { source: 'leads', phone: '5511999999999' },
      }),
    ).toEqual({
      source: 'leads',
      phone: '5511999999999',
      sourceLabel: 'Leads',
    });
  });

  it('reads from raw payload when no dashboardContext key', () => {
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

  it('prefers nested dashboardContext over raw payload', () => {
    const result = readDashboardContextFromMetadata({
      source: 'should-ignore',
      dashboardContext: { source: 'checkout', planId: 'plan-1' },
    });

    expect(result).toEqual({
      source: 'checkout',
      planId: 'plan-1',
      sourceLabel: 'Checkout',
    });
  });

  it('falls back to source object when dashboardContext is not an object', () => {
    const result = readDashboardContextFromMetadata({
      dashboardContext: 'invalid',
    });

    expect(result).not.toBeNull();
    expect(result?.sourceLabel).toBe('Operação');
  });

  it('returns normalized object for empty object input', () => {
    const result = readDashboardContextFromMetadata({});
    expect(result).not.toBeNull();
    expect(result?.sourceLabel).toBe('Operação');
  });
});

// ── buildDashboardHref ────────────────────────────────────────────────────────

describe('buildDashboardHref', () => {
  it('returns base chat route for null/undefined', () => {
    expect(buildDashboardHref(null)).toBe('/chat');
    expect(buildDashboardHref(undefined)).toBe('/chat');
  });

  it('returns base chat route for empty input', () => {
    expect(buildDashboardHref({})).toBe('/chat');
  });

  it('builds query string with a single param', () => {
    expect(buildDashboardHref({ source: 'leads' })).toBe('/chat?source=leads');
  });

  it('builds query string with multiple params', () => {
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
      '/chat?conversationId=conv_123&source=checkout&productId=prod_1&productName=Oferta+Premium&planId=plan_9&checkoutSlug=oferta-premium&purpose=recovery',
    );
  });

  it('skips empty and whitespace-only params', () => {
    expect(
      buildDashboardHref({
        source: 'inbox',
        leadId: '',
        phone: '   ',
        email: 'test@example.com',
      }),
    ).toBe('/chat?source=inbox&email=test%40example.com');
  });

  it('encodes special characters in values', () => {
    expect(
      buildDashboardHref({
        email: 'test@example.com',
      }),
    ).toBe('/chat?email=test%40example.com');
  });
});

// ── buildDashboardSourceHref ──────────────────────────────────────────────────

describe('buildDashboardSourceHref', () => {
  it('returns null for null/undefined', () => {
    expect(buildDashboardSourceHref(null)).toBeNull();
    expect(buildDashboardSourceHref(undefined)).toBeNull();
  });

  it('returns null for unknown source', () => {
    expect(buildDashboardSourceHref({ source: 'unknown' })).toBeNull();
    expect(buildDashboardSourceHref({ source: '' })).toBeNull();
  });

  // leads
  it('builds leads href with query params', () => {
    expect(
      buildDashboardSourceHref({
        source: 'leads',
        leadId: 'lead_1',
        phone: '5511999999999',
      }),
    ).toBe('/leads?leadId=lead_1&phone=5511999999999');
  });

  it('builds leads href without query when no params', () => {
    expect(buildDashboardSourceHref({ source: 'leads' })).toBe('/leads');
  });

  // followups
  it('builds followups href', () => {
    expect(
      buildDashboardSourceHref({
        source: 'followups',
        leadId: 'lead_1',
        phone: '5511999999999',
      }),
    ).toBe('/followups?source=dashboard&leadId=lead_1&phone=5511999999999');
  });

  // inbox
  it('builds inbox href', () => {
    expect(
      buildDashboardSourceHref({
        source: 'inbox',
        phone: '5511999999999',
        draft: 'mensagem inicial',
      }),
    ).toBe('/inbox?source=dashboard&phone=5511999999999&draft=mensagem+inicial');
  });

  // pricing
  it('builds pricing href', () => {
    expect(buildDashboardSourceHref({ source: 'pricing' })).toBe('/pricing');
  });

  // checkout
  it('builds checkout href with planId', () => {
    expect(
      buildDashboardSourceHref({
        source: 'checkout',
        planId: 'plan_9',
      }),
    ).toBe('/checkout/plan_9');
  });

  it('prefers checkoutSlug over planId', () => {
    expect(
      buildDashboardSourceHref({
        source: 'checkout',
        planId: 'plan_9',
        checkoutSlug: 'oferta-premium',
      }),
    ).toBe('/oferta-premium');
  });

  it('returns null for checkout without slug or planId', () => {
    expect(buildDashboardSourceHref({ source: 'checkout' })).toBeNull();
  });

  it('encodes checkout slug', () => {
    expect(
      buildDashboardSourceHref({
        source: 'checkout',
        checkoutSlug: 'oferta premium/special',
      }),
    ).toBe('/oferta%20premium%2Fspecial');
  });

  // marketing
  it('builds marketing href', () => {
    expect(buildDashboardSourceHref({ source: 'marketing' })).toBe('/marketing');
  });

  // scrapers
  it('builds scrapers href', () => {
    expect(buildDashboardSourceHref({ source: 'scrapers' })).toBe('/scrapers');
  });

  // flow
  it('builds flow href with tab=editor', () => {
    const href = buildDashboardSourceHref({
      source: 'flow',
      leadId: 'lead_1',
      phone: '5511999999999',
      purpose: 'qualification',
    });

    expect(href).toContain('/flow?');
    expect(href).toContain('tab=editor');
    expect(href).toContain('source=dashboard');
    expect(href).toContain('leadId=lead_1');
    expect(href).toContain('phone=5511999999999');
    expect(href).toContain('purpose=qualification');
  });

  // landing
  it('builds landing href', () => {
    expect(buildDashboardSourceHref({ source: 'landing' })).toBe('/');
  });
});

// ── buildDashboardContextPrompt ───────────────────────────────────────────────

describe('buildDashboardContextPrompt', () => {
  it('returns default prompt for null/undefined', () => {
    const result = buildDashboardContextPrompt(null);
    expect(result).toContain('próxima melhor ação');
  });

  it('returns draft directly when present', () => {
    const draft = 'Preciso de ajuda com este lead específico.';
    expect(buildDashboardContextPrompt({ draft })).toBe(draft);
  });

  it('includes contact fields in the prompt', () => {
    const result = buildDashboardContextPrompt({
      source: 'leads',
      name: 'João Silva',
      phone: '5511999999999',
      email: 'joao@example.com',
      leadId: 'lead_abc',
    });

    expect(result).toContain('Nome do contato: João Silva');
    expect(result).toContain('Telefone: 5511999999999');
    expect(result).toContain('Email: joao@example.com');
    expect(result).toContain('Lead ID: lead_abc');
  });

  it('includes product and plan fields', () => {
    const result = buildDashboardContextPrompt({
      source: 'checkout',
      productName: 'Premium Plan',
      productId: 'prod_1',
      planName: 'Anual',
      planId: 'plan_9',
    });

    expect(result).toContain('Produto: Premium Plan');
    expect(result).toContain('Produto ID: prod_1');
    expect(result).toContain('Plano: Anual');
    expect(result).toContain('Plano ID: plan_9');
  });

  it('specializes for recovery purpose', () => {
    const result = buildDashboardContextPrompt({
      source: 'checkout',
      purpose: 'recovery',
    });

    expect(result).toContain('abordagem de recuperação');
  });

  it('specializes for inbox source', () => {
    const result = buildDashboardContextPrompt({ source: 'inbox' });
    expect(result).toContain('melhor resposta');
    expect(result).toContain('ação comercial');
  });

  it('specializes for leads source', () => {
    const result = buildDashboardContextPrompt({ source: 'leads' });
    expect(result).toContain('qualificar este lead');
    expect(result).toContain('avançar a venda');
  });

  it('specializes for followups source', () => {
    const result = buildDashboardContextPrompt({ source: 'followups' });
    expect(result).toContain('retomar este contato');
    expect(result).toContain('inbox, flow ou campanha');
  });

  it('specializes for checkout source', () => {
    const result = buildDashboardContextPrompt({ source: 'checkout' });
    expect(result).toContain('destravar a venda');
    expect(result).toContain('objeções comerciais');
  });

  it('specializes for pricing source', () => {
    const result = buildDashboardContextPrompt({ source: 'pricing' });
    expect(result).toContain('concluir o plano ideal');
  });

  it('specializes for landing source', () => {
    const result = buildDashboardContextPrompt({ source: 'landing' });
    expect(result).toContain('transformar curiosidade em próximo passo');
  });

  it('uses default objective for unrecognized source', () => {
    const result = buildDashboardContextPrompt({ source: 'home' });
    expect(result).toContain('próxima melhor ação com base neste contexto');
  });
});

// ── summarizeDashboardContext ─────────────────────────────────────────────────

describe('summarizeDashboardContext', () => {
  it('returns empty array for null/undefined', () => {
    expect(summarizeDashboardContext(null)).toEqual([]);
    expect(summarizeDashboardContext(undefined)).toEqual([]);
  });

  it('includes origin "Operação" even for empty input', () => {
    expect(summarizeDashboardContext({})).toEqual(['Origem: Operação']);
  });

  it('includes origin when source is present', () => {
    const result = summarizeDashboardContext({ source: 'leads' });
    expect(result).toContain('Origem: Leads');
  });

  it('includes all populated fields', () => {
    const result = summarizeDashboardContext({
      source: 'checkout',
      name: 'João',
      phone: '5511999999999',
      email: 'joao@example.com',
      productName: 'Premium',
      planName: 'Anual',
    });

    expect(result).toEqual([
      'Origem: Checkout',
      'Contato: João',
      'Telefone: 5511999999999',
      'Email: joao@example.com',
      'Produto: Premium',
      'Plano: Anual',
    ]);
  });

  it('skips empty and whitespace-only fields', () => {
    const result = summarizeDashboardContext({
      source: 'pricing',
      name: '   ',
      email: '',
    });

    expect(result).toEqual(['Origem: Pricing']);
  });

  it('includes purpose when present', () => {
    const result = summarizeDashboardContext({ purpose: 'recovery' });
    expect(result).toContain('Objetivo: recovery');
  });
});
