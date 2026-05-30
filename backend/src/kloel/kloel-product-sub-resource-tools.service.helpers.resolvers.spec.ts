import type { PrismaService } from '../prisma/prisma.service';
import {
  buildCreateUrlData,
  buildUpdateCheckoutData,
  buildUpdateUrlData,
  buildUpdateUrlWhereClause,
  findProductIdByPartialName,
  findUrlByLabelOrUrl,
  resolveCheckoutIdFromArgs,
  resolveFallbackProductIdForCoupon,
  resolvePlanIdFromArgs,
} from './kloel-product-sub-resource-tools.service.helpers';
import { partialMatch } from '../../test/helpers/match-instance';

function createPrismaStub() {
  return {
    product: { findFirst: jest.fn() },
    productPlan: { findFirst: jest.fn() },
    productCheckout: { findFirst: jest.fn() },
    productUrl: { findFirst: jest.fn() },
  } as unknown as PrismaService & {
    product: { findFirst: jest.Mock };
    productPlan: { findFirst: jest.Mock };
    productCheckout: { findFirst: jest.Mock };
    productUrl: { findFirst: jest.Mock };
  };
}

describe('kloel-product-sub-resource-tools.service.helpers (resolvers)', () => {
  describe('resolvePlanIdFromArgs', () => {
    it('returns explicit planId when present', async () => {
      const prisma = createPrismaStub();
      const result = await resolvePlanIdFromArgs(prisma, 'ws-1', { planId: 'plan-abc' });
      expect(result).toBe('plan-abc');
      expect(prisma.productPlan.findFirst).not.toHaveBeenCalled();
    });

    it('resolves via planName lookup when planId missing', async () => {
      const prisma = createPrismaStub();
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'plan-1' });
      const result = await resolvePlanIdFromArgs(prisma, 'ws-1', { planName: 'Premium' });
      expect(result).toBe('plan-1');
      expect(prisma.productPlan.findFirst).toHaveBeenCalledWith({
        where: {
          name: { contains: 'Premium', mode: 'insensitive' },
          product: { workspaceId: 'ws-1' },
        },
        select: { id: true },
      });
    });

    it('falls back to args.name when planName missing', async () => {
      const prisma = createPrismaStub();
      prisma.productPlan.findFirst.mockResolvedValue({ id: 'plan-2' });
      const result = await resolvePlanIdFromArgs(prisma, 'ws-1', { name: 'Basic' });
      expect(result).toBe('plan-2');
    });

    it('returns empty string when nothing resolves', async () => {
      const prisma = createPrismaStub();
      const result = await resolvePlanIdFromArgs(prisma, 'ws-1', {});
      expect(result).toBe('');
      expect(prisma.productPlan.findFirst).not.toHaveBeenCalled();
    });

    it('returns empty string when lookup misses', async () => {
      const prisma = createPrismaStub();
      prisma.productPlan.findFirst.mockResolvedValue(null);
      const result = await resolvePlanIdFromArgs(prisma, 'ws-1', { planName: 'nope' });
      expect(result).toBe('');
    });
  });

  describe('resolveCheckoutIdFromArgs', () => {
    it('returns explicit checkoutId when present', async () => {
      const prisma = createPrismaStub();
      const result = await resolveCheckoutIdFromArgs(prisma, 'ws-1', { checkoutId: 'co-1' });
      expect(result).toBe('co-1');
      expect(prisma.productCheckout.findFirst).not.toHaveBeenCalled();
    });

    it('resolves via checkoutName', async () => {
      const prisma = createPrismaStub();
      prisma.productCheckout.findFirst.mockResolvedValue({ id: 'co-2' });
      const result = await resolveCheckoutIdFromArgs(prisma, 'ws-1', { checkoutName: 'Main' });
      expect(result).toBe('co-2');
    });

    it('falls back to args.name then args.planName', async () => {
      const prisma = createPrismaStub();
      prisma.productCheckout.findFirst.mockResolvedValueOnce({ id: 'co-3' });
      const result = await resolveCheckoutIdFromArgs(prisma, 'ws-1', { planName: 'Gold' });
      expect(result).toBe('co-3');
      expect(prisma.productCheckout.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: partialMatch({
            name: { contains: 'Gold', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('returns empty string when nothing matches', async () => {
      const prisma = createPrismaStub();
      const result = await resolveCheckoutIdFromArgs(prisma, 'ws-1', {});
      expect(result).toBe('');
    });
  });

  describe('buildUpdateCheckoutData', () => {
    it('returns empty object when no updatable fields present', () => {
      expect(buildUpdateCheckoutData({})).toEqual({});
    });

    it('passes through checkoutName', () => {
      expect(buildUpdateCheckoutData({ checkoutName: 'NewName' })).toEqual({ name: 'NewName' });
    });

    it('coerces active to boolean', () => {
      expect(buildUpdateCheckoutData({ active: true })).toEqual({ active: true });
      expect(buildUpdateCheckoutData({ active: 0 })).toEqual({ active: false });
      expect(buildUpdateCheckoutData({ active: 'yes' })).toEqual({ active: true });
    });

    it('combines both fields', () => {
      expect(buildUpdateCheckoutData({ checkoutName: 'X', active: false })).toEqual({
        name: 'X',
        active: false,
      });
    });

    it('ignores undefined fields (Prisma-friendly)', () => {
      expect(buildUpdateCheckoutData({ active: undefined })).toEqual({});
    });
  });

  describe('buildCreateUrlData', () => {
    it('uses label when present', () => {
      expect(
        buildCreateUrlData('pid-1', { url: 'https://x.com', label: 'Home', isPrivate: false }),
      ).toEqual({
        productId: 'pid-1',
        url: 'https://x.com',
        description: 'Home',
        isPrivate: false,
      });
    });

    it('falls back to url when label missing', () => {
      expect(buildCreateUrlData('pid-1', { url: 'https://x.com' })).toEqual({
        productId: 'pid-1',
        url: 'https://x.com',
        description: 'https://x.com',
        isPrivate: false,
      });
    });

    it('sets isPrivate=true only when strictly true', () => {
      expect(buildCreateUrlData('pid', { url: 'u', isPrivate: true }).isPrivate).toBe(true);
      expect(buildCreateUrlData('pid', { url: 'u', isPrivate: 'true' }).isPrivate).toBe(false);
      expect(buildCreateUrlData('pid', { url: 'u' }).isPrivate).toBe(false);
    });
  });

  describe('buildUpdateUrlData', () => {
    it('returns empty when no defined args', () => {
      expect(buildUpdateUrlData({})).toEqual({});
    });

    it('passes through url when truthy', () => {
      expect(buildUpdateUrlData({ url: 'https://new.com' })).toEqual({ url: 'https://new.com' });
    });

    it('skips empty url string', () => {
      expect(buildUpdateUrlData({ url: '' })).toEqual({});
    });

    it('passes through label as description when defined', () => {
      expect(buildUpdateUrlData({ label: 'NewLabel' })).toEqual({ description: 'NewLabel' });
    });

    it('preserves empty-string label (explicit clear)', () => {
      expect(buildUpdateUrlData({ label: '' })).toEqual({ description: '' });
    });

    it('coerces isPrivate to strict-true equality', () => {
      expect(buildUpdateUrlData({ isPrivate: true })).toEqual({ isPrivate: true });
      expect(buildUpdateUrlData({ isPrivate: 'true' })).toEqual({ isPrivate: false });
    });

    it('combines all fields', () => {
      expect(buildUpdateUrlData({ url: 'u', label: 'l', isPrivate: true })).toEqual({
        url: 'u',
        description: 'l',
        isPrivate: true,
      });
    });
  });

  describe('buildUpdateUrlWhereClause', () => {
    it('always sets description filter', () => {
      const where = buildUpdateUrlWhereClause('Docs', '');
      expect(where).toEqual({ description: { contains: 'Docs', mode: 'insensitive' } });
    });

    it('adds productId when truthy', () => {
      const where = buildUpdateUrlWhereClause('Docs', 'pid-1');
      expect(where).toEqual({
        description: { contains: 'Docs', mode: 'insensitive' },
        productId: 'pid-1',
      });
    });
  });

  describe('findUrlByLabelOrUrl', () => {
    it('returns label match when label hits', async () => {
      const prisma = createPrismaStub();
      prisma.productUrl.findFirst.mockResolvedValueOnce({ id: 'u-1', url: 'https://a' });
      const result = await findUrlByLabelOrUrl(prisma, 'ws-1', 'Site', '');
      expect(result).toEqual({ id: 'u-1', url: 'https://a' });
      expect(prisma.productUrl.findFirst).toHaveBeenCalledTimes(1);
    });

    it('falls back to url contains when label misses', async () => {
      const prisma = createPrismaStub();
      prisma.productUrl.findFirst.mockResolvedValueOnce(null);
      prisma.productUrl.findFirst.mockResolvedValueOnce({ id: 'u-2', url: 'https://b' });
      const result = await findUrlByLabelOrUrl(prisma, 'ws-1', 'Missing', 'https://b');
      expect(result).toEqual({ id: 'u-2', url: 'https://b' });
      expect(prisma.productUrl.findFirst).toHaveBeenCalledTimes(2);
    });

    it('skips label query when label empty', async () => {
      const prisma = createPrismaStub();
      prisma.productUrl.findFirst.mockResolvedValueOnce({ id: 'u-3', url: 'https://c' });
      const result = await findUrlByLabelOrUrl(prisma, 'ws-1', '', 'https://c');
      expect(result).toEqual({ id: 'u-3', url: 'https://c' });
      expect(prisma.productUrl.findFirst).toHaveBeenCalledTimes(1);
    });

    it('returns null when both miss', async () => {
      const prisma = createPrismaStub();
      prisma.productUrl.findFirst.mockResolvedValue(null);
      const result = await findUrlByLabelOrUrl(prisma, 'ws-1', 'l', 'u');
      expect(result).toBeNull();
    });

    it('returns null when both inputs are empty', async () => {
      const prisma = createPrismaStub();
      const result = await findUrlByLabelOrUrl(prisma, 'ws-1', '', '');
      expect(result).toBeNull();
      expect(prisma.productUrl.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('resolveFallbackProductIdForCoupon', () => {
    it('returns first product id when one exists', async () => {
      const prisma = createPrismaStub();
      prisma.product.findFirst.mockResolvedValue({ id: 'p-1' });
      const result = await resolveFallbackProductIdForCoupon(prisma, 'ws-1');
      expect(result).toBe('p-1');
    });

    it('returns empty string when no products exist', async () => {
      const prisma = createPrismaStub();
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await resolveFallbackProductIdForCoupon(prisma, 'ws-1');
      expect(result).toBe('');
    });
  });

  describe('findProductIdByPartialName', () => {
    it('returns empty string when productName is empty', async () => {
      const prisma = createPrismaStub();
      const result = await findProductIdByPartialName(prisma, 'ws-1', '');
      expect(result).toBe('');
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('returns id when found', async () => {
      const prisma = createPrismaStub();
      prisma.product.findFirst.mockResolvedValue({ id: 'p-x' });
      const result = await findProductIdByPartialName(prisma, 'ws-1', 'Course');
      expect(result).toBe('p-x');
      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', name: { contains: 'Course', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('returns empty string when not found', async () => {
      const prisma = createPrismaStub();
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await findProductIdByPartialName(prisma, 'ws-1', 'Course');
      expect(result).toBe('');
    });
  });
});
