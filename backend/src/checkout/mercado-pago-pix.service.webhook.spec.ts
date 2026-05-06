import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

import { MercadoPagoPixService } from './mercado-pago-pix.service';

function makeMpResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123456789,
    status: 'pending',
    transaction_amount: 139.9,
    payment_method_id: 'pix',
    point_of_interaction: {
      transaction_data: {
        qr_code: '000201010212...',
        qr_code_base64: 'base64png==',
      },
    },
    date_of_expiration: '2026-05-06T22:59:59.000-03:00',
    ...overrides,
  };
}

describe('MercadoPagoPixService — webhook & lookup', () => {
  let service: MercadoPagoPixService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-123-ACCESS-TOKEN';
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new MercadoPagoPixService();
  });

  afterEach(() => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    jest.restoreAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('validates Mercado Pago HMAC manifest signatures', () => {
      const dataId = '123456789';
      const requestId = 'request-1';
      const ts = String(Math.floor(Date.now() / 1000));
      const secret = 'webhook-secret';
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

      expect(
        service.verifyWebhookSignature({
          dataId,
          requestId,
          signatureHeader: `ts=${ts},v1=${v1}`,
          secret,
        }),
      ).toBe(true);
    });

    it('rejects invalid Mercado Pago webhook signatures', () => {
      const ts = String(Math.floor(Date.now() / 1000));
      expect(
        service.verifyWebhookSignature({
          dataId: '123456789',
          requestId: 'request-1',
          signatureHeader: `ts=${ts},v1=deadbeef`,
          secret: 'webhook-secret',
        }),
      ).toBe(false);
    });

    it('rejects stale Mercado Pago webhook signatures', () => {
      const dataId = '123456789';
      const requestId = 'request-1';
      const ts = String(Math.floor(Date.now() / 1000) - 301);
      const secret = 'webhook-secret';
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

      expect(
        service.verifyWebhookSignature({
          dataId,
          requestId,
          signatureHeader: `ts=${ts},v1=${v1}`,
          secret,
        }),
      ).toBe(false);
    });
  });

  describe('getPayment', () => {
    it('fetches and normalizes a Mercado Pago payment snapshot', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeMpResponse({
            status: 'approved',
            metadata: {
              kloel_order_id: 'order-1',
              workspace_id: 'ws-1',
            },
          }),
      });

      const result = await service.getPayment('123456789');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.mercadopago.com/v1/payments/123456789');
      expect(init.method).toBe('GET');
      expect(result).toMatchObject({
        externalId: '123456789',
        status: 'approved',
        metadata: {
          kloel_order_id: 'order-1',
          workspace_id: 'ws-1',
        },
      });
    });

    it('throws ServiceUnavailableException when payment lookup fails at provider', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'not_found' }),
      });

      await expect(service.getPayment('missing')).rejects.toThrow(ServiceUnavailableException);
      await expect(service.getPayment('missing')).rejects.toThrow(
        'Mercado Pago rejeitou a consulta do Pix.',
      );
    });
  });
});
