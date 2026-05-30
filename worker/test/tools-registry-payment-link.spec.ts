import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P0 regression guard: the AI agent tool `create_payment_link` must NEVER
 * fabricate a fake/mock Stripe checkout URL and forward it to a real WhatsApp
 * customer. When no payment provider is configured it must return an honest
 * "payment unavailable / setup-required" signal so the agent surfaces an honest
 * state instead of a fraudulent link.
 */

const { mockSessionsCreate } = vi.hoisted(() => ({
  mockSessionsCreate: vi.fn(),
}));

vi.mock('../db', () => ({
  prisma: {
    pipeline: { findFirst: vi.fn() },
    stage: { findFirst: vi.fn(), findMany: vi.fn() },
    deal: { create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('../providers/crm', () => ({
  CRM: {
    updateContact: vi.fn(),
    addTag: vi.fn(),
    getContact: vi.fn(),
  },
}));

vi.mock('../providers/stripe-runtime', () => ({
  // Minimal Stripe-shaped constructor used only when STRIPE_SECRET_KEY is set.
  // Must be `new`-able because tools-registry does `new StripeRuntime(...)`.
  StripeRuntime: class {
    checkout = { sessions: { create: mockSessionsCreate } };
  },
}));

const FAKE_LINK_MARKERS = ['(MOCK)', 'checkout.stripe.com/pay'];

describe('ToolsRegistry create_payment_link — no fake links to customers', () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecret;
    }
  });

  it('returns an honest unavailable signal (never a fake link) when no provider is configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const { ToolsRegistry } = await import('../providers/tools-registry');
    const result = await ToolsRegistry.execute(
      'create_payment_link',
      { productName: 'Curso Premium', amount: 197 },
      { workspaceId: 'ws-1', user: '+5511999999999' },
    );

    expect(typeof result).toBe('string');
    for (const marker of FAKE_LINK_MARKERS) {
      expect(result).not.toContain(marker);
    }
    // It must be an honest, explicit unavailable signal — not a URL.
    expect(result).not.toMatch(/^https?:\/\//);
    expect(result.toLowerCase()).toContain('unavailable');
  });

  it('returns the real Stripe session URL when a provider is configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    mockSessionsCreate.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/c/pay/cs_test_realsession',
    });

    const { ToolsRegistry } = await import('../providers/tools-registry');
    const result = await ToolsRegistry.execute(
      'create_payment_link',
      { productName: 'Curso Premium', amount: 197 },
      { workspaceId: 'ws-1', user: '+5511999999999' },
    );

    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    expect(result).toBe('https://checkout.stripe.com/c/pay/cs_test_realsession');
    expect(result).not.toContain('(MOCK)');
  });

  it('surfaces a real Stripe error (not a fake link) when session creation fails', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    mockSessionsCreate.mockRejectedValueOnce(new Error('No such price'));

    const { ToolsRegistry } = await import('../providers/tools-registry');
    const result = await ToolsRegistry.execute(
      'create_payment_link',
      { productName: 'Curso Premium', amount: 197 },
      { workspaceId: 'ws-1', user: '+5511999999999' },
    );

    expect(result).toContain('Stripe Error');
    for (const marker of FAKE_LINK_MARKERS) {
      expect(result).not.toContain(marker);
    }
  });

  it('source file contains no fabricated payment-link literal in every code path', () => {
    const src = readFileSync(
      join(__dirname, '..', 'providers', 'tools-registry.ts'),
      'utf8',
    );
    expect(src).not.toContain('(MOCK)');
    expect(src).not.toContain('checkout.stripe.com/pay');
    expect(src).not.toContain('mockPaymentLink');
  });
});
