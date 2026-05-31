import { BadRequestException } from '@nestjs/common';

import {
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  buildMercadoPagoTopupCreditTxData,
  buildMercadoPagoTopupTransactionMetadata,
  buildPixTopupChargeRequest,
  buildWalletNotFoundOnMercadoPagoWebhookReport,
  formatMercadoPagoQrImage,
  normalizePayerDocument,
  parseMercadoPagoWalletReference,
  readMercadoPagoTransactionAmountCents,
  shapePixTopupResult,
} from './wallet.service.helpers';

describe('wallet.service.helpers (mercadopago)', () => {
  describe('formatMercadoPagoQrImage', () => {
    it('returns a data URL for non-empty base64 payloads', () => {
      expect(formatMercadoPagoQrImage('AAAA')).toBe('data:image/png;base64,AAAA');
    });

    it('returns undefined when the QR payload is empty', () => {
      expect(formatMercadoPagoQrImage('')).toBeUndefined();
    });
  });

  describe('parseMercadoPagoWalletReference', () => {
    it('returns null for non-object payloads', () => {
      expect(parseMercadoPagoWalletReference(null)).toBeNull();
      expect(parseMercadoPagoWalletReference(undefined)).toBeNull();
      expect(parseMercadoPagoWalletReference('wallet_topup:a:b:c')).toBeNull();
      expect(parseMercadoPagoWalletReference(42)).toBeNull();
    });

    it('returns null when external_reference is missing', () => {
      expect(parseMercadoPagoWalletReference({})).toBeNull();
    });

    it('returns null when external_reference is not a wallet top-up', () => {
      expect(
        parseMercadoPagoWalletReference({ external_reference: 'checkout:order:123' }),
      ).toBeNull();
    });

    it('returns null when external_reference is not a string', () => {
      expect(parseMercadoPagoWalletReference({ external_reference: 123 })).toBeNull();
    });

    it('parses workspaceId / walletId / nonce from the reference', () => {
      const parsed = parseMercadoPagoWalletReference({
        external_reference: 'wallet_topup:ws-1:wallet-2:abc-def',
      });
      expect(parsed).toEqual({ workspaceId: 'ws-1', walletId: 'wallet-2', nonce: 'abc-def' });
    });

    it('throws BadRequestException when each segment is missing', () => {
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup::wallet-2:nonce' }),
      ).toThrow(BadRequestException);
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup:ws-1::nonce' }),
      ).toThrow(BadRequestException);
      expect(() =>
        parseMercadoPagoWalletReference({ external_reference: 'wallet_topup:ws-1:wallet-2:' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('readMercadoPagoTransactionAmountCents', () => {
    it('returns null for non-object payloads', () => {
      expect(readMercadoPagoTransactionAmountCents(null)).toBeNull();
      expect(readMercadoPagoTransactionAmountCents(undefined)).toBeNull();
      expect(readMercadoPagoTransactionAmountCents('10.00')).toBeNull();
    });

    it('returns null when transaction_amount is missing', () => {
      expect(readMercadoPagoTransactionAmountCents({})).toBeNull();
    });

    it('parses numeric amounts into cents', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 10 })).toBe(1000n);
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 10.5 })).toBe(1050n);
    });

    it('parses string amounts into cents', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: '12.34' })).toBe(1234n);
    });

    it('rounds fractional cents to the nearest integer cent', () => {
      // 0.005 rounds up to 1 cent (Math.round) -> 0.005 * 100 = 0.5 -> rounds to 1
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0.005 })).toBe(1n);
      // 0.004 stays at 0 cents
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0.004 })).toBe(0n);
    });

    it('returns null for non-positive amounts', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 0 })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: -1 })).toBeNull();
    });

    it('returns null for non-finite amounts', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: 'oops' })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: Number.NaN })).toBeNull();
      expect(
        readMercadoPagoTransactionAmountCents({ transaction_amount: Number.POSITIVE_INFINITY }),
      ).toBeNull();
    });

    it('ignores amounts with the wrong type entirely', () => {
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: true })).toBeNull();
      expect(readMercadoPagoTransactionAmountCents({ transaction_amount: {} })).toBeNull();
    });
  });

  describe('normalizePayerDocument', () => {
    it('strips non-digits from CPF', () => {
      expect(normalizePayerDocument('123.456.789-09', null)).toBe('12345678909');
    });

    it('falls back to CNPJ when CPF is missing', () => {
      expect(normalizePayerDocument(null, '12.345.678/0001-99')).toBe('12345678000199');
    });

    it('returns undefined when neither field has digits', () => {
      expect(normalizePayerDocument(null, null)).toBeUndefined();
      expect(normalizePayerDocument('', '')).toBeUndefined();
      expect(normalizePayerDocument('---', undefined)).toBeUndefined();
    });
  });

  describe('shapePixTopupResult', () => {
    it('prefers the rendered QR data URL over the ticket URL', () => {
      expect(
        shapePixTopupResult({
          externalId: 'mp_1',
          qrCode: 'copy-paste',
          qrCodeBase64: 'AAAA',
          ticketUrl: 'https://mp/ticket',
        }),
      ).toEqual({
        paymentIntentId: 'mp_1',
        clientSecret: null,
        pixQrCode: 'copy-paste',
        pixQrCodeUrl: 'data:image/png;base64,AAAA',
      });
    });

    it('falls back to the ticket URL when no QR base64 is available', () => {
      expect(
        shapePixTopupResult({
          externalId: 'mp_2',
          qrCode: '',
          qrCodeBase64: '',
          ticketUrl: 'https://mp/ticket-2',
        }),
      ).toEqual({
        paymentIntentId: 'mp_2',
        clientSecret: null,
        pixQrCodeUrl: 'https://mp/ticket-2',
      });
    });
  });

  describe('buildPixTopupChargeRequest', () => {
    it('assembles the MP charge request with deterministic nonce and expiry', () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      const charge = buildPixTopupChargeRequest({
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: '12345678909',
        nonce: 'nonce-1',
        now,
      });
      expect(charge).toMatchObject({
        idempotencyKey: 'wallet-topup:ws-1:nonce-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: '12345678909',
        description: 'Kloel prepaid wallet top-up - workspace ws-1',
        externalReference: 'wallet_topup:ws-1:wallet-1:nonce-1',
      });
      expect(charge.expiresAt.getTime()).toBe(now.getTime() + PIX_EXPIRATION_MINUTES * 60_000);
      expect(charge.notificationUrl.endsWith(MP_WEBHOOK_PATH)).toBe(true);
    });

    it('omits payerDocument when undefined', () => {
      const charge = buildPixTopupChargeRequest({
        workspaceId: 'ws-1',
        walletId: 'wallet-1',
        amountCents: 1000n,
        payerEmail: 'buyer@example.com',
        payerDocument: undefined,
        nonce: 'nonce-2',
        now: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect('payerDocument' in charge).toBe(false);
    });
  });

  describe('buildMercadoPagoTopupTransactionMetadata', () => {
    it('tags Mercado Pago topups with provider/method/status', () => {
      expect(buildMercadoPagoTopupTransactionMetadata({ status: 'approved' })).toEqual({
        provider: 'mercadopago',
        method: 'pix',
        status: 'approved',
      });
    });
  });

  describe('buildMercadoPagoTopupCreditTxData', () => {
    it('shapes Mercado Pago TOPUP create-data with the MP reference type and provider metadata', () => {
      const data = buildMercadoPagoTopupCreditTxData({
        walletId: 'w1',
        amountCents: 9900n,
        newBalanceCents: 10000n,
        externalId: 'mp_999',
        status: 'approved',
      });
      expect(data).toEqual({
        walletId: 'w1',
        type: 'TOPUP',
        amountCents: 9900n,
        balanceAfterCents: 10000n,
        referenceType: WALLET_MERCADOPAGO_REFERENCE_TYPE,
        referenceId: 'mp_999',
        metadata: { provider: 'mercadopago', method: 'pix', status: 'approved' },
      });
    });
  });

  describe('buildWalletNotFoundOnMercadoPagoWebhookReport', () => {
    it('formats the Mercado Pago wallet-not-found envelope', () => {
      const report = buildWalletNotFoundOnMercadoPagoWebhookReport({
        walletId: 'w1',
        workspaceId: 'ws1',
        externalId: 'mp1',
      });
      expect(report.error.message).toBe(
        'wallet_not_found_on_mercadopago_webhook: wallet=w1 mp=mp1',
      );
      expect(report.extra).toEqual({ walletId: 'w1', workspaceId: 'ws1', externalId: 'mp1' });
    });
  });
});
