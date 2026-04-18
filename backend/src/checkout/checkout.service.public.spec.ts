import { CheckoutService } from './checkout.service';

describe('CheckoutService public resolution', () => {
  let service: CheckoutService;
  let prisma: any;
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

    service = new CheckoutService(prisma, { processPayment: jest.fn() } as any, {} as any);
    loggerSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    (service as any).planLinkManager.ensurePlanReferenceCode = jest
      .fn()
      .mockImplementation(async (plan: any) => ({
        ...plan,
        referenceCode: plan.referenceCode || 'MPX9Q2Z7',
      }));
    (service as any).publicPayloadBuilder.build = jest
      .fn()
      .mockImplementation(async (plan: any) => ({
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
    expect((service as any).publicPayloadBuilder.build).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'plan_1',
        referenceCode: 'MPX9Q2Z7',
      }),
    );
    expect((service as any).publicPayloadBuilder.build).toHaveBeenNthCalledWith(
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
