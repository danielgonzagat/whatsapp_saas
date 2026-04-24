import type { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';

type CheckoutPrismaMock = {
  checkoutPlanLink: {
    findFirst: jest.Mock;
  };
  checkoutProductPlan: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  affiliateLink: {
    findFirst: jest.Mock;
  };
  workspace: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

type CheckoutPlanRecord = {
  id?: string;
  slug?: string;
  referenceCode?: string | null;
} & Record<string, unknown>;

type CheckoutPublicPayload = {
  id: string;
  slug: string;
  checkoutCode: string | null | undefined;
  paymentProvider: {
    provider: string;
    connected: boolean;
    checkoutEnabled: boolean;
    publicKey: string;
    supportsCreditCard: boolean;
    supportsPix: boolean;
    supportsBoleto: boolean;
  };
};

type CheckoutServiceInternals = {
  logger: {
    log: (message: string) => void;
  };
  publicPayloadBuilder: {
    build: (plan: CheckoutPlanRecord) => Promise<CheckoutPublicPayload>;
  };
};

describe('CheckoutService public resolution', () => {
  let service: CheckoutService;
  let internalService: CheckoutServiceInternals;
  let prisma: CheckoutPrismaMock;
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      checkoutPlanLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutProductPlan: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      affiliateLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      workspace: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const planLinkManagerMock = {
      ensurePlanReferenceCode: jest.fn().mockImplementation(async (plan: CheckoutPlanRecord) => ({
        ...plan,
        referenceCode: plan.referenceCode || 'MPX9Q2Z7',
      })),
    };

    service = new CheckoutService(
      prisma as unknown as PrismaService,
      { getPlanLinkManager: jest.fn().mockReturnValue(planLinkManagerMock) } as never,
      {} as never,
      {} as never,
    );
    internalService = service as unknown as CheckoutServiceInternals;
    loggerSpy = jest.spyOn(internalService.logger, 'log').mockImplementation(() => undefined);

    internalService.publicPayloadBuilder.build = jest
      .fn()
      .mockImplementation(async (plan: CheckoutPlanRecord) => ({
        id: plan.id,
        slug: plan.slug,
        checkoutCode: plan.referenceCode,
        paymentProvider: {
          provider: 'stripe',
          connected: true,
          checkoutEnabled: true,
          publicKey: 'pk_test_checkout',
          supportsCreditCard: true,
          supportsPix: true,
          supportsBoleto: false,
        },
      }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves equivalent commercial payloads by slug and code for the same plan', async () => {
    const planRecord = {
      id: 'plan_1',
      slug: 'coreamy-oferta',
      referenceCode: 'MPX9Q2Z7',
      kind: 'PLAN',
      isActive: true,
      productId: 'prod_1',
      product: {
        workspaceId: 'ws_1',
      },
      checkoutConfig: {},
      orderBumps: [],
      upsells: [],
    };

    prisma.checkoutProductPlan.findUnique.mockResolvedValue(planRecord);
    prisma.checkoutProductPlan.findFirst.mockResolvedValue(planRecord);

    const bySlug = await service.getCheckoutBySlug('coreamy-oferta', {
      correlationId: 'corr-slug',
    });
    const byCode = await service.getCheckoutByCode('MPX9Q2Z7', {
      correlationId: 'corr-code',
    });

    expect(bySlug).toEqual(byCode);
    expect(internalService.publicPayloadBuilder.build).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'plan_1',
        referenceCode: 'MPX9Q2Z7',
      }),
    );
    expect(internalService.publicPayloadBuilder.build).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'plan_1',
        referenceCode: 'MPX9Q2Z7',
      }),
    );
    expect(bySlug.paymentProvider).toEqual(
      expect.objectContaining({
        provider: 'stripe',
        checkoutEnabled: true,
        supportsCreditCard: true,
        supportsPix: true,
        supportsBoleto: false,
      }),
    );

    const loggedEvents = loggerSpy.mock.calls.map(([message]) => JSON.parse(String(message)));
    expect(loggedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'checkout_public_lookup_start',
          correlationId: 'corr-slug',
          lookupType: 'slug',
        }),
        expect.objectContaining({
          event: 'checkout_public_lookup_start',
          correlationId: 'corr-code',
          lookupType: 'code',
        }),
      ]),
    );
  });
});
