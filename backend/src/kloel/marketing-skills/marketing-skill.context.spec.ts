import { MarketingSkillContextBuilder } from './marketing-skill.context';

describe('MarketingSkillContextBuilder', () => {
  it('builds a workspace snapshot with conversion and revenue context', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Kloel' }),
      },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue({ value: { style: 'Direto e vendedor' } }),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'prod-1' }])
          .mockResolvedValueOnce([{ id: 'prod-1', name: 'Curso', price: 97, active: true }]),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      checkoutOrder: {
        count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(5),
        aggregate: jest.fn().mockResolvedValue({ _sum: { totalInCents: 48500 } }),
      },
      checkoutSocialLead: {
        count: jest.fn().mockResolvedValue(20),
      },
      campaign: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'camp-1', name: 'Lançamento', status: 'DRAFT', scheduledAt: null },
          ]),
      },
      kloelSite: {
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1),
      },
      affiliateProduct: {
        findMany: jest.fn().mockResolvedValue([{ id: 'aff-prod-1' }, { id: 'aff-prod-2' }]),
      },
      affiliateLink: {
        count: jest.fn().mockResolvedValue(6),
      },
      contact: {
        count: jest.fn().mockResolvedValue(120),
      },
    } as unknown as ConstructorParameters<typeof MarketingSkillContextBuilder>[0];

    const builder = new MarketingSkillContextBuilder(prisma);
    const snapshot = await builder.buildSnapshot('ws-1');

    expect(snapshot.workspaceName).toBe('Kloel');
    expect(snapshot.brandVoice).toBe('Direto e vendedor');
    expect(snapshot.productCount).toBe(1);
    expect(snapshot.paidOrderCount).toBe(5);
    expect(snapshot.socialLeadCount).toBe(20);
    expect(snapshot.checkoutConversionRate).toBe(25);
    expect(snapshot.grossRevenueCents).toBe(48500);
    expect(snapshot.affiliateProductCount).toBe(2);
    expect(snapshot.affiliateLinkCount).toBe(6);
    expect(snapshot.notes).toEqual([]);
  });
});
