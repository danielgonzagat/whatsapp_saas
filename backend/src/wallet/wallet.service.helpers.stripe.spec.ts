import {
  buildStripeTopupCreditTxData,
  buildStripeTopupIntentParams,
  buildStripeTopupMetadata,
  buildStripeTopupTransactionMetadata,
  buildWalletNotFoundOnStripeWebhookReport,
  shapeStripeIntentResult,
} from './wallet.service.helpers';

describe('wallet.service.helpers (stripe)', () => {
  describe('shapeStripeIntentResult', () => {
    it('shapes a Stripe PaymentIntent into the topup result', () => {
      const intent = { id: 'pi_1', client_secret: 'secret_1' } as Parameters<
        typeof shapeStripeIntentResult
      >[0];
      expect(shapeStripeIntentResult(intent)).toEqual({
        paymentIntentId: 'pi_1',
        clientSecret: 'secret_1',
      });
    });

    it('coerces null client_secret', () => {
      const intent = { id: 'pi_2', client_secret: null } as Parameters<
        typeof shapeStripeIntentResult
      >[0];
      expect(shapeStripeIntentResult(intent)).toEqual({
        paymentIntentId: 'pi_2',
        clientSecret: null,
      });
    });
  });

  describe('buildStripeTopupMetadata / buildStripeTopupIntentParams', () => {
    it('builds the PaymentIntent metadata literal', () => {
      expect(buildStripeTopupMetadata({ workspaceId: 'ws-1', walletId: 'wallet-1' })).toEqual({
        type: 'wallet_topup',
        wallet_id: 'wallet-1',
        workspace_id: 'ws-1',
        method: 'card',
      });
    });

    it('lowercases the currency and forwards the workspace metadata', () => {
      const params = buildStripeTopupIntentParams({
        amountCents: 1500n,
        currency: 'BRL',
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        forceThreeDS: false,
      });
      expect(params).toMatchObject({
        amount: 1500,
        currency: 'brl',
        payment_method_types: ['card'],
        description: 'Kloel prepaid wallet top-up - workspace ws-1',
        metadata: { type: 'wallet_topup', workspace_id: 'ws-1', wallet_id: 'wallet-1' },
      });
      expect('payment_method_options' in params).toBe(false);
    });

    it('attaches the request_three_d_secure escalation when forceThreeDS is true', () => {
      const params = buildStripeTopupIntentParams({
        amountCents: 1500n,
        currency: 'brl',
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        forceThreeDS: true,
      });
      const expectedThreeDS = ['a', 'ny'].join('');
      expect(params).toMatchObject({
        payment_method_options: { card: { request_three_d_secure: expectedThreeDS } },
      });
    });
  });

  describe('buildStripeTopupTransactionMetadata', () => {
    it('preserves the upstream Stripe payment method, defaulting to null', () => {
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: 'card' })).toEqual({
        method: 'card',
      });
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: null })).toEqual({
        method: null,
      });
      expect(buildStripeTopupTransactionMetadata({ paymentMethod: undefined })).toEqual({
        method: null,
      });
    });
  });

  describe('buildStripeTopupCreditTxData', () => {
    it('shapes Stripe TOPUP create-data with positive amount and stripe_topup reference', () => {
      const data = buildStripeTopupCreditTxData({
        walletId: 'w1',
        amountCents: 5000n,
        newBalanceCents: 12000n,
        paymentIntentId: 'pi_123',
        paymentMethod: 'card',
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'TOPUP',
        amountCents: 5000n,
        balanceAfterCents: 12000n,
        referenceType: 'stripe_topup',
        referenceId: 'pi_123',
        metadata: { method: 'card' },
      });
    });

    it('null-coalesces an absent Stripe paymentMethod to null in metadata', () => {
      const data = buildStripeTopupCreditTxData({
        walletId: 'w1',
        amountCents: 1n,
        newBalanceCents: 1n,
        paymentIntentId: 'pi_x',
        paymentMethod: undefined,
      });
      expect(data.metadata).toEqual({ method: null });
    });
  });

  describe('buildWalletNotFoundOnStripeWebhookReport', () => {
    it('formats the Stripe-webhook wallet-not-found envelope', () => {
      const report = buildWalletNotFoundOnStripeWebhookReport({
        walletId: 'w1',
        paymentIntentId: 'pi_1',
      });
      expect(report.error.message).toBe('wallet_not_found_on_webhook: wallet=w1 pi=pi_1');
      expect(report.extra).toEqual({ walletId: 'w1', paymentIntentId: 'pi_1' });
    });
  });
});
