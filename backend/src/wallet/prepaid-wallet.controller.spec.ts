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
  makeMercadoPagoPixDouble,
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
    it('creates a PIX top-up through Mercado Pago and returns material proof', async () => {
      const mercadoPagoPix = makeMercadoPagoPixDouble();
      mercadoPagoPix.create.mockResolvedValue({
        externalId: 'mp_wallet_pix_controller',
        status: 'pending',
        qrCode: 'pix_copy_paste',
        qrCodeBase64: 'pix_png_base64',
        ticketUrl: 'https://mercadopago.example/pix/controller',
        expiresAt: new Date('2026-05-28T12:00:00.000Z'),
        raw: { id: 'mp_wallet_pix_controller' },
      });
      const factory = makePrismaStub();
      deps = await buildModule(stripe, factory, makeFraudEngineStub(), mercadoPagoPix);

      const result = await deps.controller.createTopup('ws_1', {
        amountCents: 5_000,
        method: 'pix',
        buyerEmail: 'buyer@test.com',
        buyerCpf: '12345678909',
      });

      expect(stripe.stripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(mercadoPagoPix.create).toHaveBeenCalled();
      expect(result.provider).toBe('mercadopago');
      expect(result.paymentIntentId).toBe('mp_wallet_pix_controller');
      expect(result.clientSecret).toBeNull();
      expect(result.pixQrCode).toBe('pix_copy_paste');
      expect(result.pixQrCodeBase64).toBe('data:image/png;base64,pix_png_base64');
      expect(result.pixQrCodeUrl).toBe('https://mercadopago.example/pix/controller');
      expect(result.pixExpiresAt).toBe('2026-05-28T12:00:00.000Z');
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
          metadata: expect.objectContaining({ workspace_id: 'ws_2', method: 'card' }),
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
