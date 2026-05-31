import { NotFoundException } from '@nestjs/common';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import type { PrismaService } from '../prisma/prisma.service';
import { AffiliateService } from './affiliate.service';

describe('AffiliateService', () => {
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let service: AffiliateService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPartialPrismaMock({
      product: ['findFirst', 'updateMany'],
      affiliatePartner: ['findMany'],
    });
    service = new AffiliateService(prisma as PrismaService);
  });

  describe('getConfig', () => {
    it('returns config for a product owned by the workspace', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p-1',
        workspaceId: 'ws-1',
        affiliateEnabled: true,
        commissionPercent: 25,
        affiliateAutoApprove: false,
        affiliateVisible: true,
        affiliateAccessData: true,
        affiliateAccessAbandoned: false,
        affiliateFirstInstallment: false,
        commissionType: 'last_click',
        commissionCookieDays: 90,
      });

      const result = await service.getConfig('ws-1', 'p-1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', workspaceId: 'ws-1' },
      });
      expect(result.enabled).toBe(true);
      expect(result.commission).toBe(25);
      expect(result.rules).toEqual({
        autoApprove: false,
        visible: true,
        accessData: true,
        accessAbandoned: false,
        firstInstallment: false,
        commissionType: 'last_click',
        cookieDays: 90,
      });
    });

    it('throws NotFoundException when product is not in workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.getConfig('ws-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when product belongs to a different workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.getConfig('ws-1', 'p-other')).rejects.toThrow(NotFoundException);

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-other', workspaceId: 'ws-1' },
      });
    });
  });

  describe('configure', () => {
    const productStub = {
      id: 'p-1',
      workspaceId: 'ws-1',
    };

    it('updates enabled and commission on the product', async () => {
      prisma.product.findFirst.mockResolvedValue(productStub);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.configure('ws-1', 'p-1', {
        enabled: false,
        commission: 40,
      });

      expect(result).toEqual({ updated: true });
      const updateCalls = prisma.product.updateMany.mock.calls as Array<
        [{ where: Record<string, unknown>; data: Record<string, unknown> }]
      >;
      expect(updateCalls[0]?.[0]?.where).toMatchObject({
        id: 'p-1',
        workspaceId: 'ws-1',
      });
      expect(updateCalls[0]?.[0]?.data).toMatchObject({
        affiliateEnabled: false,
        commissionPercent: 40,
      });
    });

    it('maps known rules keys to product fields', async () => {
      prisma.product.findFirst.mockResolvedValue(productStub);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });

      await service.configure('ws-1', 'p-1', {
        rules: {
          autoApprove: false,
          cookieDays: 60,
          commissionType: 'first_click',
        },
      });

      const updateCalls = prisma.product.updateMany.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(updateCalls[0]?.[0]?.data).toMatchObject({
        affiliateAutoApprove: false,
        commissionCookieDays: 60,
        commissionType: 'first_click',
      });
    });

    it('ignores unknown or wrong-type rules keys', async () => {
      prisma.product.findFirst.mockResolvedValue(productStub);
      prisma.product.updateMany.mockResolvedValue({ count: 1 });

      await service.configure('ws-1', 'p-1', {
        rules: {
          unknownKey: 'value',
          cookieDays: 'not-a-number',
        },
      });

      const updateCalls2 = prisma.product.updateMany.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(Object.keys(updateCalls2[0]?.[0]?.data ?? {})).not.toContain('unknownKey');
    });

    it('throws NotFoundException when product is not in workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.configure('ws-1', 'p-other', { enabled: true })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list', () => {
    it('lists all affiliate partners for the workspace', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'ap-1',
          partnerEmail: 'aff@test.com',
          commissionRate: 30,
          status: 'ACTIVE',
          productIds: ['p-1'],
        },
        {
          id: 'ap-2',
          partnerEmail: 'aff2@test.com',
          commissionRate: 25,
          status: 'PENDING',
          productIds: ['p-2'],
        },
      ]);

      const result = await service.list('ws-1');

      expect(prisma.affiliatePartner.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'ap-1',
        email: 'aff@test.com',
        commissionRate: 30,
        status: 'ACTIVE',
      });
    });

    it('filters by productId when provided', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'ap-1',
          partnerEmail: 'aff@test.com',
          commissionRate: 30,
          status: 'ACTIVE',
          productIds: ['p-1'],
        },
        {
          id: 'ap-2',
          partnerEmail: 'aff2@test.com',
          commissionRate: 25,
          status: 'PENDING',
          productIds: ['p-2'],
        },
      ]);

      const result = await service.list('ws-1', 'p-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ap-1');
    });

    it('returns empty array when no partners exist', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([]);

      const result = await service.list('ws-1');

      expect(result).toEqual([]);
    });

    it('returns empty array when productId filter matches nothing', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'ap-1',
          partnerEmail: 'aff@test.com',
          commissionRate: 30,
          status: 'ACTIVE',
          productIds: ['p-1'],
        },
      ]);

      const result = await service.list('ws-1', 'p-nonexistent');

      expect(result).toEqual([]);
    });
  });
});
