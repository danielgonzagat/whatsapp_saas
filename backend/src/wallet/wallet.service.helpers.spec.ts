import { BadRequestException } from '@nestjs/common';

import {
  DEFAULT_BACKEND_ORIGIN,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  formatMercadoPagoQrImage,
  parseMercadoPagoWalletReference,
  readMercadoPagoTransactionAmountCents,
  resolveBackendOrigin,
} from './wallet.service.helpers';

describe('wallet.service.helpers', () => {
  describe('constants', () => {
    it('exposes the canonical Mercado Pago webhook path', () => {
      expect(MP_WEBHOOK_PATH).toBe('/webhooks/mercadopago');
    });

    it('exposes the PIX expiration window in minutes', () => {
      expect(PIX_EXPIRATION_MINUTES).toBe(30);
    });

    it('exposes the canonical Mercado Pago reference type', () => {
      expect(WALLET_MERCADOPAGO_REFERENCE_TYPE).toBe('mercadopago_pix_topup');
    });

    it('exposes a sane default backend origin for local dev', () => {
      expect(DEFAULT_BACKEND_ORIGIN).toBe('http://localhost:3001');
    });
  });

  describe('resolveBackendOrigin', () => {
    const savedEnv = {
      PUBLIC_BACKEND_URL: process.env.PUBLIC_BACKEND_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    };

    afterEach(() => {
      for (const key of Object.keys(savedEnv) as Array<keyof typeof savedEnv>) {
        const original = savedEnv[key];
        if (original === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original;
        }
      }
    });

    it('falls back to localhost when no env vars are set', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      expect(resolveBackendOrigin()).toBe(DEFAULT_BACKEND_ORIGIN);
    });

    it('prefers PUBLIC_BACKEND_URL over BACKEND_URL', () => {
      process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com';
      process.env.BACKEND_URL = 'https://internal.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://api.kloel.com');
    });

    it('uses BACKEND_URL when PUBLIC_BACKEND_URL is missing', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      process.env.BACKEND_URL = 'https://internal.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://internal.kloel.com');
    });

    it('falls back to NEXT_PUBLIC_API_BASE_URL last before the default', () => {
      delete process.env.PUBLIC_BACKEND_URL;
      delete process.env.BACKEND_URL;
      process.env.NEXT_PUBLIC_API_BASE_URL = 'https://staging.kloel.com';
      expect(resolveBackendOrigin()).toBe('https://staging.kloel.com');
    });

    it('strips a trailing slash so the path concatenation is safe', () => {
      process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com/';
      expect(resolveBackendOrigin()).toBe('https://api.kloel.com');
    });
  });

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

    it('throws BadRequestException when any segment is missing', () => {
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
});
