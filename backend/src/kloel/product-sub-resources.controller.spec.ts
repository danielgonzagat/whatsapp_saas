import { NotFoundException, type Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductAffiliateController,
  ProductAIConfigController,
  ProductCampaignController,
  ProductCheckoutController,
  ProductCommissionController,
  ProductCouponController,
  ProductPlanController,
  ProductReviewController,
  ProductUrlController,
} from './product-sub-resources.controller';

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const WS_A_USER = { user: { sub: 'user-a', workspaceId: WS_A } } as never;
const WS_B_USER = { user: { sub: 'user-b', workspaceId: WS_B } } as never;
const PROD_A = 'prod-a';

type PrismaMock = { product: { findFirst: jest.Mock } };
type PrismaOverrides = Record<string, Record<string, jest.Mock> | jest.Mock>;
type PrismaTransactionMock = Record<string, Record<string, jest.Mock>>;

function makeProductFindFirst() {
  return jest
    .fn()
    .mockImplementation(({ where }: { where: { id?: string; workspaceId?: string } }) => {
      if (where.workspaceId === WS_A && (where.id === PROD_A || !where.id)) {
        return Promise.resolve({ id: PROD_A, workspaceId: WS_A, name: 'Product A' });
      }
      return Promise.resolve(null);
    });
}

function moduleWith(
  Controller: new (...args: unknown[]) => unknown,
  prismaOverrides: PrismaOverrides = {},
  extraProviders: ReadonlyArray<Provider> = [],
) {
  return Test.createTestingModule({
    controllers: [Controller],
    providers: [
      {
        provide: PrismaService,
        useValue: {
          product: { findFirst: makeProductFindFirst() },
          ...prismaOverrides,
        },
      },
      { provide: AuditService, useValue: { log: jest.fn() } },
      {
        provide: PartnershipsService,
        useValue: { createPartner: jest.fn().mockResolvedValue({ id: 'p1' }) },
      },
      {
        provide: CampaignsService,
        useValue: {
          create: jest.fn().mockResolvedValue({ id: 'c1' }),
          launch: jest.fn(),
          pause: jest.fn(),
        },
      },
      ...extraProviders,
    ],
  }).compile();
}

describe('Product Sub-Resources — Cross-Workspace Isolation', () => {
  // ─── AI Config ───────────────────────────────────────────────
  describe('ProductAIConfigController', () => {
    let controller: ProductAIConfigController;
    let prisma: PrismaMock;

    beforeEach(async () => {
      const mod = await moduleWith(ProductAIConfigController, {
        productAIConfig: {
          findUnique: jest.fn().mockResolvedValue({ productId: PROD_A, temperature: 0.7 }),
          upsert: jest
            .fn()
            .mockImplementation(({ create }) => Promise.resolve({ id: 'cfg1', ...create })),
        },
      });
      controller = mod.get(ProductAIConfigController);
      prisma = mod.get(PrismaService);
    });

    it('blocks workspace-B from reading workspace-A AI config', async () => {
      await expect(controller.get(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PROD_A, workspaceId: WS_B } }),
      );
    });

    it('allows workspace-A to read its own AI config', async () => {
      const result = await controller.get(PROD_A, WS_A_USER);
      expect(result).toHaveProperty('temperature', 0.7);
    });

    it('blocks workspace-B from upserting workspace-A AI config', async () => {
      await expect(controller.upsert(PROD_A, {}, WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Affiliate ────────────────────────────────────────────────
  describe('ProductAffiliateController', () => {
    let controller: ProductAffiliateController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductAffiliateController, {
        product: {
          findFirst: makeProductFindFirst(),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: PROD_A, workspaceId: WS_A }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        affiliateProduct: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'ap1' }),
        },
        affiliateRequest: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'req1',
            affiliateProductId: 'ap1',
            affiliateWorkspaceId: WS_B,
          }),
          update: jest.fn().mockResolvedValue({ id: 'req1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        affiliateLink: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'link1', code: 'ABC123' }),
          update: jest.fn().mockResolvedValue({ id: 'link1' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: PrismaTransactionMock) => unknown) =>
          fn({
            affiliateRequest: {
              update: jest.fn().mockResolvedValue({ id: 'req1' }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            affiliateLink: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ id: 'link1', code: 'ABC123' }),
              update: jest.fn().mockResolvedValue({ id: 'link1' }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          }),
        ),
      });
      controller = mod.get(ProductAffiliateController);
    });

    it('blocks workspace-B from reading workspace-A affiliate summary', async () => {
      await expect(controller.getSummary(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from updating workspace-A affiliate config', async () => {
      await expect(controller.updateConfig(PROD_A, {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from approving affiliate request on workspace-A product', async () => {
      await expect(controller.approveRequest(PROD_A, 'req1', WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from rejecting affiliate request on workspace-A product', async () => {
      await expect(controller.rejectRequest(PROD_A, 'req1', WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from updating affiliate link on workspace-A product', async () => {
      await expect(
        controller.updateLink(PROD_A, 'link1', { active: true }, WS_B_USER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Campaign ────────────────────────────────────────────────
  describe('ProductCampaignController', () => {
    let controller: ProductCampaignController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductCampaignController, {
        product: { findFirst: makeProductFindFirst() },
        campaign: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'c1' }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        productCampaign: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation(({ data }) => Promise.resolve({ id: 'pc1', ...data })),
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'pc1', productId: PROD_A, name: 'Test', code: 'T' }),
          update: jest
            .fn()
            .mockImplementation(({ data }) => Promise.resolve({ id: 'pc1', ...data })),
          delete: jest.fn().mockResolvedValue({ id: 'pc1' }),
        },
      });
      controller = mod.get(ProductCampaignController);
    });

    it('blocks workspace-B from listing campaigns on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating campaign on workspace-A product', async () => {
      await expect(controller.create(PROD_A, { name: 'X' }, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from updating campaign on workspace-A product', async () => {
      await expect(controller.update(PROD_A, 'pc1', { name: 'Y' }, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from launching campaign on workspace-A product', async () => {
      await expect(controller.launch(PROD_A, 'pc1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from pausing campaign on workspace-A product', async () => {
      await expect(controller.pause(PROD_A, 'pc1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from deleting campaign on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'pc1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Checkout ────────────────────────────────────────────────
  describe('ProductCheckoutController', () => {
    let controller: ProductCheckoutController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductCheckoutController, {
        productCheckout: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation(({ data }) => Promise.resolve({ id: 'ch1', ...data })),
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'ch1', productId: PROD_A, name: 'Checkout' }),
          update: jest.fn().mockResolvedValue({ id: 'ch1' }),
          delete: jest.fn().mockResolvedValue({ id: 'ch1' }),
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: PrismaTransactionMock) => unknown) =>
          fn({
            productCheckout: {
              findFirst: jest.fn().mockResolvedValue({ id: 'ch1', productId: PROD_A }),
              update: jest.fn().mockResolvedValue({ id: 'ch1' }),
            },
          }),
        ),
      });
      controller = mod.get(ProductCheckoutController);
    });

    it('blocks workspace-B from listing checkouts on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating checkout on workspace-A product', async () => {
      await expect(controller.create(PROD_A, { name: 'CH' }, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from updating checkout on workspace-A product', async () => {
      await expect(controller.update(PROD_A, 'ch1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from deleting checkout on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'ch1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Commission ──────────────────────────────────────────────
  describe('ProductCommissionController', () => {
    let controller: ProductCommissionController;

    beforeEach(async () => {
      const mod = await moduleWith(
        ProductCommissionController,
        {
          productCommission: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest
              .fn()
              .mockImplementation((args: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: 'cm1', ...args.data }),
              ),
            delete: jest.fn().mockResolvedValue({ id: 'cm1' }),
            findFirst: jest.fn().mockResolvedValue({ id: 'cm1', productId: PROD_A }),
            update: jest.fn().mockResolvedValue({ id: 'cm1' }),
          },
          $transaction: jest.fn().mockImplementation((fn: (tx: PrismaTransactionMock) => unknown) =>
            fn({
              productCommission: {
                findFirst: jest.fn().mockResolvedValue({ id: 'cm1', productId: PROD_A }),
                update: jest.fn().mockResolvedValue({ id: 'cm1' }),
              },
            }),
          ),
        },
        [
          {
            provide: PartnershipsService,
            useValue: { createPartner: jest.fn().mockResolvedValue({ id: 'p1' }) },
          },
        ],
      );
      controller = mod.get(ProductCommissionController);
    });

    it('blocks workspace-B from listing commissions on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating commission on workspace-A product', async () => {
      await expect(
        controller.create(
          PROD_A,
          { role: 'AFFILIATE', percentage: 10, agentName: 'X', agentEmail: 'x@ex.com' },
          WS_B_USER,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from updating commission on workspace-A product', async () => {
      await expect(controller.update(PROD_A, 'cm1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from deleting commission on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'cm1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Coupon ──────────────────────────────────────────────────
  describe('ProductCouponController', () => {
    let controller: ProductCouponController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductCouponController, {
        productCoupon: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) =>
              Promise.resolve({ id: 'cp1', ...args.data }),
            ),
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'cp1', productId: PROD_A, code: 'ABC', active: true }),
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'cp1', productId: PROD_A, code: 'ABC', active: true }),
          update: jest.fn().mockResolvedValue({ id: 'cp1', code: 'ABC' }),
          delete: jest.fn().mockResolvedValue({ id: 'cp1', code: 'ABC' }),
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: PrismaTransactionMock) => unknown) =>
          fn({
            productCoupon: {
              findFirst: jest.fn().mockResolvedValue({ id: 'cp1', productId: PROD_A, code: 'ABC' }),
              update: jest.fn().mockResolvedValue({ id: 'cp1', code: 'ABC' }),
            },
          }),
        ),
      });
      controller = mod.get(ProductCouponController);
    });

    it('blocks workspace-B from listing coupons on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating coupon on workspace-A product', async () => {
      await expect(
        controller.create(PROD_A, { code: 'ABC', discount: 10 }, WS_B_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from updating coupon on workspace-A product', async () => {
      await expect(controller.update(PROD_A, 'cp1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from validating coupon on workspace-A product', async () => {
      await expect(controller.validate(PROD_A, { code: 'ABC' }, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from deleting coupon on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'cp1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('allows workspace-A to validate its own coupon', async () => {
      const result = await controller.validate(PROD_A, { code: 'ABC' }, WS_A_USER);
      expect(result).toHaveProperty('valid', true);
    });
  });

  // ─── Plan ────────────────────────────────────────────────────
  describe('ProductPlanController', () => {
    let controller: ProductPlanController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductPlanController, {
        productPlan: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) =>
              Promise.resolve({ id: 'pl1', ...args.data }),
            ),
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'pl1', productId: PROD_A, name: 'Basic', price: 100 }),
          update: jest.fn().mockResolvedValue({ id: 'pl1' }),
          delete: jest.fn().mockResolvedValue({ id: 'pl1' }),
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: PrismaTransactionMock) => unknown) =>
          fn({
            productPlan: {
              findFirst: jest.fn().mockResolvedValue({ id: 'pl1', productId: PROD_A }),
              update: jest.fn().mockResolvedValue({ id: 'pl1' }),
            },
          }),
        ),
      });
      controller = mod.get(ProductPlanController);
    });

    it('blocks workspace-B from listing plans on workspace-A product', async () => {
      await expect(controller.listPlans(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from getting plan on workspace-A product', async () => {
      await expect(controller.getPlan(PROD_A, 'pl1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating plan on workspace-A product', async () => {
      await expect(
        controller.createPlan(PROD_A, { name: 'Basic', price: 99 }, WS_B_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from updating plan on workspace-A product', async () => {
      await expect(controller.updatePlan(PROD_A, 'pl1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from deleting plan on workspace-A product', async () => {
      await expect(controller.deletePlan(PROD_A, 'pl1', WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Review ──────────────────────────────────────────────────
  describe('ProductReviewController', () => {
    let controller: ProductReviewController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductReviewController, {
        productReview: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) =>
              Promise.resolve({ id: 'rv1', ...args.data }),
            ),
          findFirst: jest.fn().mockResolvedValue({ id: 'rv1', productId: PROD_A }),
          delete: jest.fn().mockResolvedValue({ id: 'rv1' }),
        },
      });
      controller = mod.get(ProductReviewController);
    });

    it('blocks workspace-B from listing reviews on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating review on workspace-A product', async () => {
      await expect(
        controller.create(PROD_A, { rating: 5, authorName: 'X', comment: 'Good' }, WS_B_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from deleting review on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'rv1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── URL ─────────────────────────────────────────────────────
  describe('ProductUrlController', () => {
    let controller: ProductUrlController;

    beforeEach(async () => {
      const mod = await moduleWith(ProductUrlController, {
        productUrl: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation((args: { data: Record<string, unknown> }) =>
              Promise.resolve({ id: 'u1', ...args.data }),
            ),
          findFirst: jest.fn().mockResolvedValue({ id: 'u1', productId: PROD_A }),
          update: jest.fn().mockResolvedValue({ id: 'u1' }),
          delete: jest.fn().mockResolvedValue({ id: 'u1' }),
        },
      });
      controller = mod.get(ProductUrlController);
    });

    it('blocks workspace-B from listing URLs on workspace-A product', async () => {
      await expect(controller.list(PROD_A, WS_B_USER)).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from creating URL on workspace-A product', async () => {
      await expect(
        controller.create(PROD_A, { description: 'Site', url: 'https://x.com' }, WS_B_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks workspace-B from updating URL on workspace-A product', async () => {
      await expect(controller.update(PROD_A, 'u1', {}, WS_B_USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks workspace-B from deleting URL on workspace-A product', async () => {
      await expect(controller.delete(PROD_A, 'u1', WS_B_USER)).rejects.toThrow(NotFoundException);
    });
  });
});
