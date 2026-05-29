import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { SmartPaymentService } from '../kloel/smart-payment.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { SalesService } from './sales.service';

/**
 * Integration-style flow spec for {@link SalesService.createPixOrder} V2
 * (the tier-5 capability path that routes through {@link SmartPaymentService}).
 *
 * Production contract (see CLAUDE.md "REGRA DE PAGAMENTOS" + "REGRA DE
 * INTEGRACOES EXTERNAS"):
 *  - workspaceId isolation: product lookup, plan lookup, and persisted
 *    `KloelSale` row all filter/scope by workspaceId; cross-workspace
 *    lookups surface NotFoundException;
 *  - bigint correctness: `amountCents` is bigint computed from the plan's
 *    Real price (centavos = price * 100); zero/negative price rejected with
 *    ServiceUnavailableException so the buyer never sees a zero-cost PIX;
 *  - external provider isolation: SmartPaymentService failure or absence
 *    falls back to a deterministic EMV-shaped stub so the buyer flow keeps
 *    working — no exception escapes;
 *  - sale persistence: each call creates a fresh KloelSale row with a
 *    unique uuid orderId; metadata carries the capability discriminator
 *    `sales.create_pix` for downstream analytics;
 *  - CPF sanitization: when buyer.cpf is present, only digits land in
 *    metadata (sanitized via `sanitizeDocumentDigits`).
 *
 * All collaborators are mocked. No real Mercado Pago, Stripe, or DB.
 */

describe('SalesService.createPixOrder V2 (E2E flow)', () => {
  let service: SalesService;
  let prisma: {
    product: { findFirst: jest.Mock };
    productPlan: { findFirst: jest.Mock };
    kloelSale: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mpBoleto: { create: jest.Mock };
  let mpPix: { create: jest.Mock };
  let stripe: { stripe: { checkout: { sessions: { create: jest.Mock } } } };
  let audit: { log: jest.Mock; logWithTx: jest.Mock };
  let spine: { emit: jest.Mock };
  let smartPayment: { createSmartPayment: jest.Mock };

  const ws = 'ws-real';
  const productId = 'prod-1';
  const planId = 'plan-1';

  const product = { id: productId, name: 'Curso AI Native', active: true, workspaceId: ws };
  const plan = { id: planId, name: 'Plano Pro', price: 199.9 };

  const buyer = {
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '+5511999998888',
    cpf: '123.456.789-00',
  };

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      productPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      kloelSale: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    mpBoleto = { create: jest.fn() };
    mpPix = { create: jest.fn() };
    stripe = { stripe: { checkout: { sessions: { create: jest.fn() } } } };
    audit = { log: jest.fn(), logWithTx: jest.fn().mockResolvedValue(undefined) };
    spine = { emit: jest.fn().mockResolvedValue(undefined) };
    smartPayment = { createSmartPayment: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoBoletoChargeService, useValue: mpBoleto },
        { provide: MercadoPagoPixChargeService, useValue: mpPix },
        { provide: StripeService, useValue: stripe },
        { provide: AuditService, useValue: audit },
        { provide: SpineEmitterService, useValue: spine },
        { provide: SmartPaymentService, useValue: smartPayment },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('persists the sale with workspaceId and capability discriminator, returns bigint amountCents', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockResolvedValue({
      pixCopyPaste: 'PIX_CP_REAL',
      pixQrCode: 'data:image/png;base64,REAL_QR',
      paymentUrl: 'https://pay.example/abc',
      billingType: 'PIX',
      suggestedMessage: 'Pague com PIX',
    });

    const result = await service.createPixOrder(ws, { productId, planId, buyer });

    expect(typeof result.amountCents).toBe('bigint');
    expect(result.amountCents).toBe(19_990n);
    expect(result.pixCopyPaste).toBe('PIX_CP_REAL');
    expect(result.pixQrCode).toBe('data:image/png;base64,REAL_QR');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.orderId).toMatch(/^[0-9a-f-]{36}$/);

    const createCalls = prisma.kloelSale.create.mock.calls as ReadonlyArray<
      readonly [{ data?: { workspaceId?: string; metadata?: Record<string, unknown> } }]
    >;
    const persisted = createCalls[0]?.[0]?.data;
    expect(persisted?.workspaceId).toBe(ws);
    expect(persisted?.metadata).toMatchObject({
      productId,
      planId,
      buyerEmail: buyer.email,
      capability: 'sales.create_pix',
      buyerCpf: '12345678900',
    });
  });

  it('rejects cross-workspace product lookup with NotFoundException without persisting', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.createPixOrder('ws-attacker', { productId, planId, buyer }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.kloelSale.create).not.toHaveBeenCalled();
    expect(smartPayment.createSmartPayment).not.toHaveBeenCalled();

    const lookupCalls = prisma.product.findFirst.mock.calls as ReadonlyArray<
      readonly [{ where?: { workspaceId?: string } }]
    >;
    expect(lookupCalls[0]?.[0]?.where?.workspaceId).toBe('ws-attacker');
  });

  it('rejects ServiceUnavailableException when the resolved plan has zero price', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: 0 });

    await expect(service.createPixOrder(ws, { productId, planId, buyer })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.kloelSale.create).not.toHaveBeenCalled();
    expect(smartPayment.createSmartPayment).not.toHaveBeenCalled();
  });

  it('falls back to the deterministic EMV stub when SmartPaymentService throws (external resilience)', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockRejectedValue(new Error('mercadopago_unreachable'));

    const result = await service.createPixOrder(ws, { productId, planId, buyer });

    expect(result.pixCopyPaste).toContain('BR.GOV.BCB.PIX');
    expect(result.pixQrCode).toContain('stub_qr_');
    expect(result.amountCents).toBe(19_990n);
    expect(prisma.kloelSale.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to cheapest active plan (orderBy.price=asc) when planId is omitted', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockResolvedValue({
      pixCopyPaste: 'CP',
      pixQrCode: 'QR',
      paymentUrl: 'url',
      billingType: 'PIX',
      suggestedMessage: 'msg',
    });

    await service.createPixOrder(ws, { productId, buyer });

    const planCalls = prisma.productPlan.findFirst.mock.calls as ReadonlyArray<
      readonly [{ orderBy?: { price?: 'asc' | 'desc' } }]
    >;
    expect(planCalls[0]?.[0]?.orderBy).toEqual({ price: 'asc' });
  });

  it('emits unique orderIds across sequential calls (no collision)', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockResolvedValue({
      pixCopyPaste: 'CP',
      pixQrCode: 'QR',
      paymentUrl: 'url',
      billingType: 'PIX',
      suggestedMessage: 'msg',
    });

    const a = await service.createPixOrder(ws, { productId, planId, buyer });
    const b = await service.createPixOrder(ws, { productId, planId, buyer });
    const c = await service.createPixOrder(ws, { productId, planId, buyer });

    expect(new Set([a.orderId, b.orderId, c.orderId]).size).toBe(3);
    expect(prisma.kloelSale.create).toHaveBeenCalledTimes(3);
  });

  it('omits buyerCpf from sale metadata when not provided', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockResolvedValue({
      pixCopyPaste: 'CP',
      pixQrCode: 'QR',
      paymentUrl: 'url',
      billingType: 'PIX',
      suggestedMessage: 'msg',
    });

    await service.createPixOrder(ws, {
      productId,
      planId,
      buyer: { name: buyer.name, email: buyer.email },
    });

    const createCalls = prisma.kloelSale.create.mock.calls as ReadonlyArray<
      readonly [{ data?: { metadata?: Record<string, unknown> } }]
    >;
    expect(createCalls[0]?.[0]?.data?.metadata).not.toHaveProperty('buyerCpf');
  });

  it('persists with paymentMethod="PIX" and status="pending" on the sale row', async () => {
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);
    smartPayment.createSmartPayment.mockResolvedValue({
      pixCopyPaste: 'CP',
      pixQrCode: 'QR',
      paymentUrl: 'url',
      billingType: 'PIX',
      suggestedMessage: 'msg',
    });

    await service.createPixOrder(ws, { productId, planId, buyer });

    const createCalls = prisma.kloelSale.create.mock.calls as ReadonlyArray<
      readonly [{ data?: { paymentMethod?: string; status?: string; leadPhone?: string | null } }]
    >;
    const persisted = createCalls[0]?.[0]?.data;
    expect(persisted?.paymentMethod).toBe('PIX');
    expect(persisted?.status).toBe('pending');
    expect(persisted?.leadPhone).toBe(buyer.phone);
  });

  it('still persists the sale and computes amountCents even when SmartPaymentService is absent', async () => {
    (service as unknown as { smartPayment?: SmartPaymentService }).smartPayment = undefined;
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.productPlan.findFirst.mockResolvedValue(plan);

    const result = await service.createPixOrder(ws, { productId, planId, buyer });

    expect(result.amountCents).toBe(19_990n);
    expect(prisma.kloelSale.create).toHaveBeenCalledTimes(1);
    expect(result.pixCopyPaste).toContain('BR.GOV.BCB.PIX');
  });
});
