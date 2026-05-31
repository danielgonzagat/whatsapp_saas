jest.mock('@nestjs/throttler', () => {
  const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
  return {
    ...actual,
    ThrottlerGuard: class SpecThrottlerGuard {
      canActivate() {
        return true;
      }
    },
  };
});

import {
  type PrepaidWalletSpecDeps,
  type StripeStub,
  buildModule,
  makeFraudEngineStub,
  makeMercadoPagoPixStub,
  makePrismaStub,
  makeStripeStub,
  seedWallet,
} from './__test-support__/prepaid-wallet.controller.spec-helpers';

describe('PrepaidWalletController — balance & topup & lifecycle', () => {
  let stripe: StripeStub;
  let deps: PrepaidWalletSpecDeps;

  beforeEach(async () => {
    stripe = makeStripeStub();
    const factory = makePrismaStub();
    deps = await buildModule(stripe, factory);
  });

  describe('getBalance', () => {
    it('returns zero balance for a workspace without a wallet', async () => {
      const result = await deps.controller.getBalance('ws_nonexistent');
      expect(result.balanceCents).toBe('0');
      expect(result.currency).toBe('BRL');
      expect(result.autoRechargeEnabled).toBe(false);
    });

    it('returns the current balance for a workspace with a wallet', async () => {
      const wallet = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a', balanceCents: 15_000n });
      deps.factory.workspaceMap.set('ws_a', wallet);
      deps.factory.walletMap.set('pwl_a', wallet);

      const result = await deps.controller.getBalance('ws_a');
      expect(result.balanceCents).toBe('15000');
      expect(result.walletId).toBe('pwl_a');
    });

    it('exposes auto-recharge config when enabled', async () => {
      const wallet = seedWallet({
        id: 'pwl_ar',
        workspaceId: 'ws_ar',
        balanceCents: 500n,
        autoRechargeEnabled: true,
        autoRechargeThresholdCents: 1_000n,
        autoRechargeAmountCents: 5_000n,
      });
      deps.factory.workspaceMap.set('ws_ar', wallet);
      deps.factory.walletMap.set('pwl_ar', wallet);

      const result = await deps.controller.getBalance('ws_ar');
      expect(result.autoRechargeEnabled).toBe(true);
      expect(result.autoRechargeThresholdCents).toBe('1000');
      expect(result.autoRechargeAmountCents).toBe('5000');
    });

    it('ensures workspace isolation by returning empty wallet for unrelated workspace', async () => {
      const walletA = seedWallet({ id: 'pwl_a', workspaceId: 'ws_a', balanceCents: 100n });
      deps.factory.workspaceMap.set('ws_a', walletA);
      deps.factory.walletMap.set('pwl_a', walletA);

      const result = await deps.controller.getBalance('ws_b');
      expect(result.balanceCents).toBe('0');
    });
  });

  describe('createTopup', () => {
    it('creates a PIX top-up through Mercado Pago and returns QR data', async () => {
      const mercadoPagoPix = makeMercadoPagoPixStub();
      mercadoPagoPix.create.mockResolvedValue({
        externalId: 'mp_pix_wallet_1',
        status: 'pending',
        qrCode: 'pix_qr_data',
        qrCodeBase64: 'base64-qr',
        ticketUrl: 'https://www.mercadopago.com.br/payments/123/ticket',
        expiresAt: new Date('2026-05-28T01:30:00.000Z'),
        raw: {},
      });
      deps = await buildModule(stripe, deps.factory, makeFraudEngineStub(), mercadoPagoPix);

      const result = await deps.controller.createTopup('ws_1', {
        amountCents: 5_000,
        method: 'pix',
        buyerEmail: 'buyer@example.com',
      });

      expect(stripe.stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(mercadoPagoPix.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 5_000n,
          payerEmail: 'buyer@example.com',
          externalReference: expect.stringMatching(/^wallet_topup:ws_1:pwl_1:/) as unknown,
        }),
      );
      expect(result.paymentIntentId).toBe('mp_pix_wallet_1');
      expect(result.clientSecret).toBeNull();
      expect(result.pixQrCode).toBe('pix_qr_data');
      expect(result.pixQrCodeUrl).toBe('data:image/png;base64,base64-qr');
    });

    it('creates a card top-up intent', async () => {
      stripe.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_card_1',
        client_secret: 'secret_card',
        amount: 10_000,
        next_action: null,
      });

      const result = await deps.controller.createTopup('ws_2', {
        amountCents: 10_000,
        method: 'card',
        buyerEmail: 'buyer@test.com',
      });

      expect(result.paymentIntentId).toBe('pi_card_1');
      expect(stripe.stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_types: ['card'],
          metadata: expect.objectContaining({ workspace_id: 'ws_2', method: 'card' }) as unknown,
        }),
      );
    });

    it('rejects zero or negative amountCents', async () => {
      await expect(
        deps.controller.createTopup('ws_1', { amountCents: 0, method: 'pix' }),
      ).rejects.toThrow(/must be greater than 0/);

      await expect(
        deps.controller.createTopup('ws_1', { amountCents: -100, method: 'pix' }),
      ).rejects.toThrow(/must be greater than 0/);
    });

    it('blocks PIX top-up when FraudEngine returns review', async () => {
      const fraudEngine = makeFraudEngineStub();
      fraudEngine.evaluate.mockResolvedValueOnce({
        action: 'block',
        score: 1,
        reasons: [{ signal: 'blacklist', detail: 'email' }],
      });
      const prisma = makePrismaStub();
      const ctx = await buildModule(stripe, prisma, fraudEngine);

      await expect(
        ctx.controller.createTopup('ws_blocked', {
          amountCents: 10_000,
          method: 'pix',
          buyerEmail: 'bad@test.com',
        }),
      ).rejects.toThrow(/antifraude/);
    });
  });

  describe('full prepaid lifecycle', () => {
    it('topup → spend → spend → check balance (complete flow)', async () => {
      stripe.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_lifecycle',
        client_secret: 'secret_lifecycle',
        amount: 10_000,
        next_action: null,
      });

      await deps.controller.createTopup('ws_lc', {
        amountCents: 10_000,
        method: 'card',
      });

      const wallet = seedWallet({ id: 'pwl_lc', workspaceId: 'ws_lc', balanceCents: 10_000n });
      deps.factory.workspaceMap.set('ws_lc', wallet);
      deps.factory.walletMap.set('pwl_lc', wallet);

      const spendResult = await deps.controller.spend('ws_lc', {
        operation: 'site_generation',
        quotedCostCents: 2_000,
        requestId: 'req_lc_1',
      });

      expect(spendResult.success).toBe(true);
      expect(spendResult.costCents).toBe('2000');

      await deps.controller.spend('ws_lc', {
        operation: 'kb_ingestion',
        quotedCostCents: 3_000,
        requestId: 'req_lc_2',
      });

      const balanceAfterSpends = await deps.controller.getBalance('ws_lc');
      expect(balanceAfterSpends.balanceCents).toBe('5000');
    });
  });
});
