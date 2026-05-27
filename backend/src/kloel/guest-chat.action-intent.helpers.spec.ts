import type { PrismaService } from '../prisma/prisma.service';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { formatToolResult } from './guest-chat.format-tool-result.helpers';
import { extractProductArgs, extractProductName } from './guest-chat.product-args.helpers';
import { runGetProductReviews } from './kloel-chat-tools.product.helpers';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';

describe('guest chat action intent helpers', () => {
  it('routes self-awareness requests to deterministic self tools', () => {
    expect(detectActionIntent('o que você consegue fazer agora?')?.tool).toBe('self.capabilities');
    expect(detectActionIntent('quais capacidades estão quebradas?')?.tool).toBe('self.gaps');
    expect(detectActionIntent('qual integração está com erro agora?')?.tool).toBe('self.health');
    expect(detectActionIntent('explique a capacidade products.create')?.tool).toBe('self.explain');
    expect(detectActionIntent('explique a capacidade products.create')?.args).toEqual({
      capabilityId: 'products.create',
    });
  });

  it('formats self-awareness results with live proof details', () => {
    expect(
      formatToolResult('self.capabilities', {
        success: true,
        message: '42 capacidades carregadas do registry vivo',
        outputs: { total: 42 },
      }),
    ).toBe('42 capacidades carregadas do registry vivo');
    expect(
      formatToolResult('self.gaps', {
        success: true,
        message: '7 capacidades declaradas mas sem dispatcher case',
      }),
    ).toBe('7 capacidades declaradas mas sem dispatcher case');
    expect(
      formatToolResult('self.health', { success: true, outputs: { status: 'degraded' } }),
    ).toBe('Saúde do Kloel: degraded.');
  });

  it('routes URL deletion with the URL payload preserved', () => {
    const action = detectActionIntent('remove a url https://example.com/oferta no produto Serum?');

    expect(action?.tool).toBe('delete_url');
    expect(action?.args).toMatchObject({
      urlLabel: 'serum',
      url: 'https://example.com/oferta',
    });
  });

  it('routes abandonment and anticipation intents to their dedicated tools', () => {
    expect(detectActionIntent('listar carrinhos abandonados')?.tool).toBe('get_abandonments');
    expect(detectActionIntent('quero antecipacao do saldo')?.tool).toBe('request_anticipation');
  });

  it('routes product creation through the canonical products.create capability', () => {
    const action = detectActionIntent('criar produto nome: Serum Pro, preco R$ 147');

    expect(action?.tool).toBe('products.create');
    expect(action?.args).toEqual(
      expect.objectContaining({
        productName: 'serum pro',
        name: 'serum pro',
        price: 147,
      }),
    );
  });

  it('extracts product names from no-produto contexts and explicit names', () => {
    expect(extractProductName('listar urls no produto Serum?')).toBe('Serum');
    expect(extractProductArgs('criar produto nome: Serum Pro, preco R$ 147')).toEqual(
      expect.objectContaining({
        productName: 'Serum Pro',
        name: 'Serum Pro',
        price: 147,
      }),
    );
  });

  it('routes retained plan checkout warranty and broadcast intent deltas', () => {
    const disabledPlan = detectActionIntent('desativa o plano Mensal');
    expect(disabledPlan?.tool).toBe('update_plan');
    expect(disabledPlan?.args.planName).toBe('mensal');
    expect(disabledPlan?.args.active).toBe(false);

    const enabledPlan = detectActionIntent('ativa o plano Mensal');
    expect(enabledPlan?.tool).toBe('update_plan');
    expect(enabledPlan?.args.active).toBe(true);

    const checkouts = detectActionIntent('lista os checkouts');
    expect(checkouts?.tool).toBe('list_checkouts');

    const warranty = detectActionIntent('garantia de 30 dias para o produto Serum');
    expect(warranty?.tool).toBe('configure_warranty');
    expect(warranty?.args.productName).toBe('Serum');
    expect(warranty?.args.warrantyDays).toBe(30);

    const broadcast = detectActionIntent('criar campanha Black Friday mensagem: oferta hoje');
    expect(broadcast?.tool).toBe('create_broadcast');
    expect(broadcast?.args.name).toBe('Black Friday');
    expect(broadcast?.args.message).toBe('oferta hoje');
  });

  it('updates plan commercial fields and returns the changed payload', async () => {
    let planUpdateData: Record<string, unknown> | null = null;
    const productPlanFindFirst = jest.fn().mockResolvedValue({ id: 'plan-1' });
    const productPlanUpdate = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        planUpdateData = data;
        return Promise.resolve({ id: 'plan-1', name: 'Mensal', price: 99, ...data });
      });
    const service = new KloelProductSubResourceToolsService({
      productPlan: { findFirst: productPlanFindFirst, update: productPlanUpdate },
    } as unknown as PrismaService);

    const result = await service.toolUpdatePlan('ws-1', {
      planName: 'Mensal',
      quantity: 3,
      maxInstallments: 12,
      active: false,
    });

    expect(result.success).toBe(true);
    expect(planUpdateData).toEqual({
      name: 'Mensal',
      itemsPerPlan: 3,
      maxInstallments: 12,
      active: false,
    });
    expect(result.plan).toEqual({
      id: 'plan-1',
      name: 'Mensal',
      price: 99,
      itemsPerPlan: 3,
      maxInstallments: 12,
      active: false,
    });
  });

  it('creates coupons with chat-derived expiration dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-26T12:00:00.000Z'));
    let couponCreateData: Record<string, unknown> | null = null;
    const productFindFirst = jest.fn().mockResolvedValue({ id: 'prod-1' });
    const productCouponCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        couponCreateData = data;
        return Promise.resolve({ id: 'coupon-1', code: data.code });
      });
    const service = new KloelProductSubResourceToolsService({
      product: { findFirst: productFindFirst },
      productCoupon: { create: productCouponCreate },
    } as unknown as PrismaService);

    try {
      const result = await service.toolCreateCoupon('ws-1', {
        code: 'SAVE10',
        discountType: 'PERCENT',
        discountValue: 10,
        expiresInDays: 7,
      });

      expect(result.success).toBe(true);
      expect(couponCreateData).toEqual({
        productId: 'prod-1',
        code: 'SAVE10',
        discountType: 'PERCENT',
        discountValue: 10,
        maxUses: null,
        active: true,
        expiresAt: new Date('2026-06-02T12:00:00.000Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves reviews by productName with accent-tolerant fallback', async () => {
    const productReviewFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'rev-1', rating: 5, comment: 'Bom' }]);
    const prisma = {
      product: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'prod-1', name: 'Serum Facial' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', name: 'Serum Facial' }]),
      },
      productReview: {
        findMany: productReviewFindMany,
      },
    } as unknown as PrismaService;

    const result = await runGetProductReviews(prisma, 'ws-1', { productName: 'Sérum' });

    expect(result.success).toBe(true);
    expect(productReviewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'prod-1' } }),
    );
  });
});
