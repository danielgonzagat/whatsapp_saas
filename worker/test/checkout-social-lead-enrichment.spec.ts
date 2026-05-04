import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckoutSocialLeadEnrichmentStatus, CheckoutSocialLeadStatus } from '@prisma/client';
import { processCheckoutSocialLeadEnrichment } from '../processors/checkout-social-lead-enrichment';

const mockPrisma = vi.hoisted(() => ({
  checkoutSocialLead: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  contact: {
    upsert: vi.fn(),
  },
}));

vi.mock('../db', () => ({ prisma: mockPrisma }));

describe('checkout-social-lead-enrichment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const leadId = 'lead-1';
  const workspaceId = 'ws-1';

  it('throws on enrichment failure instead of silently swallowing', async () => {
    mockPrisma.checkoutSocialLead.findUnique.mockResolvedValue({
      id: leadId,
      workspaceId,
      provider: 'facebook',
      name: 'Test Lead',
      email: 'test@example.com',
      workspace: {
        providerSettings: {
          enrichment: {
            enabled: true,
            apiUrl: 'https://enrich.example.com/api',
            apiKey: 'key-1',
          },
        },
      },
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(processCheckoutSocialLeadEnrichment(leadId)).rejects.toThrow(
      'Financial operation failed: checkout_social_lead_enrichment',
    );

    expect(mockPrisma.checkoutSocialLead.updateMany).toHaveBeenCalledWith({
      where: { id: leadId },
      data: {
        enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.FAILED,
      },
    });
  });

  it('throws when database update fails in catch block', async () => {
    mockPrisma.checkoutSocialLead.findUnique.mockResolvedValue({
      id: leadId,
      workspaceId,
      provider: 'facebook',
      name: 'Test Lead',
      email: 'test@example.com',
      workspace: {
        providerSettings: {
          enrichment: {
            enabled: true,
            apiUrl: 'https://enrich.example.com/api',
            apiKey: 'key-1',
          },
        },
      },
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    mockPrisma.checkoutSocialLead.updateMany.mockRejectedValue(new Error('DB error'));

    await expect(processCheckoutSocialLeadEnrichment(leadId)).rejects.toThrow('DB error');
  });

  it('completes enrichment successfully when no errors occur', async () => {
    mockPrisma.checkoutSocialLead.findUnique.mockResolvedValue({
      id: leadId,
      workspaceId,
      provider: 'facebook',
      name: 'Test Lead',
      email: 'test@example.com',
      workspace: {
        providerSettings: {
          enrichment: {
            enabled: true,
            apiUrl: 'https://enrich.example.com/api',
            apiKey: 'key-1',
            provider: 'custom',
          },
        },
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ phone: '5511999999999', cpf: '12345678901' }),
    });

    mockPrisma.checkoutSocialLead.update.mockResolvedValue({});
    mockPrisma.contact.upsert.mockResolvedValue({});

    await processCheckoutSocialLeadEnrichment(leadId);

    expect(mockPrisma.checkoutSocialLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: leadId },
        data: expect.objectContaining({
          enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.COMPLETED,
          status: CheckoutSocialLeadStatus.ENRICHED,
          phone: '5511999999999',
          cpf: '12345678901',
        }),
      }),
    );
  });

  it('skips enrichment when lead has no email', async () => {
    mockPrisma.checkoutSocialLead.findUnique.mockResolvedValue({
      id: leadId,
      workspaceId,
      provider: 'facebook',
      name: 'No Email Lead',
      email: null,
      workspace: null,
    });

    await processCheckoutSocialLeadEnrichment(leadId);

    expect(mockPrisma.checkoutSocialLead.updateMany).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { enrichmentStatus: CheckoutSocialLeadEnrichmentStatus.SKIPPED },
    });
  });
});
