import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listVariantKeys, resolveVariantByKey } from '../processors/cia/self-improvement';

describe('autopilot-core companion — variant decision integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BACKEND_URL = 'http://localhost:3000';
  });

  it('listVariantKeys returns expected variant ids for followup', () => {
    const keys = listVariantKeys('followup');
    expect(keys).toContain('followup:direct');
    expect(keys).toContain('followup:proof');
    expect(keys).toContain('followup:scarcity');
    expect(keys.length).toBe(3);
  });

  it('listVariantKeys returns expected variant ids for payment_recovery', () => {
    const keys = listVariantKeys('payment_recovery');
    expect(keys).toContain('payment:pix_recovery');
    expect(keys).toContain('payment:confidence');
    expect(keys).toContain('payment:deadline');
    expect(keys.length).toBe(3);
  });

  it('resolveVariantByKey returns correct text for known variant', () => {
    const variant = resolveVariantByKey('followup', 'followup:direct');
    expect(variant.key).toBe('followup:direct');
    expect(variant.family).toBe('followup');
    expect(variant.text).toBeTruthy();
    expect(variant.text.length).toBeGreaterThan(20);
  });

  it('resolveVariantByKey returns first default for unknown variant key', () => {
    const variant = resolveVariantByKey('payment_recovery', 'nonexistent:variant');
    expect(variant.key).toBe('payment:pix_recovery');
    expect(variant.family).toBe('payment_recovery');
    expect(variant.text).toBeTruthy();
  });

  it('resolveBestVariantViaHttp falls back to local pick when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    const { resolveBestVariantViaHttp } = await import('../providers/mind-client');

    const result = await resolveBestVariantViaHttp({
      workspaceId: 'ws-test',
      flow: 'followup',
      variantIds: ['followup:direct', 'followup:proof', 'followup:scarcity'],
    });

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resolveBestVariantViaHttp returns null on non-200 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { resolveBestVariantViaHttp } = await import('../providers/mind-client');

    const result = await resolveBestVariantViaHttp({
      workspaceId: 'ws-test',
      flow: 'payment_recovery',
      variantIds: ['payment:pix_recovery', 'payment:confidence'],
    });

    expect(result).toBeNull();
  });

  it('resolveBestVariantViaHttp returns variant on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        variant: 'followup:proof',
        confidence: 0.72,
        fallback: false,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { resolveBestVariantViaHttp } = await import('../providers/mind-client');

    const result = await resolveBestVariantViaHttp({
      workspaceId: 'ws-test',
      flow: 'followup',
      variantIds: ['followup:direct', 'followup:proof', 'followup:scarcity'],
    });

    expect(result).not.toBeNull();
    expect(result!.variant).toBe('followup:proof');
    expect(result!.confidence).toBe(0.72);
    expect(result!.fallback).toBe(false);
  });

  it('full flow: HTTP success → resolveVariantByKey → valid message text', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        variant: 'payment:pix_recovery',
        confidence: 0.85,
        fallback: false,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { resolveBestVariantViaHttp } = await import('../providers/mind-client');

    const decision = await resolveBestVariantViaHttp({
      workspaceId: 'ws-test',
      flow: 'payment_recovery',
      variantIds: ['payment:pix_recovery', 'payment:confidence', 'payment:deadline'],
    });

    expect(decision).not.toBeNull();
    const variant = resolveVariantByKey('payment_recovery', decision!.variant);
    expect(variant.text).toContain('Vi que o pagamento');
    expect(variant.key).toBe('payment:pix_recovery');
  });

  it('full flow: HTTP failure → fallback to local pickVariant', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const { resolveBestVariantViaHttp } = await import('../providers/mind-client');

    const decision = await resolveBestVariantViaHttp({
      workspaceId: 'ws-test',
      flow: 'followup',
      variantIds: ['followup:direct', 'followup:proof', 'followup:scarcity'],
    });

    expect(decision).toBeNull();
  });
});
