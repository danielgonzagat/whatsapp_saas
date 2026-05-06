import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

import {
  CreatePixPaymentInput,
  MercadoPagoPixService,
  PixPaymentResult,
} from './mercado-pago-pix.service';

function makeInput(overrides: Partial<CreatePixPaymentInput> = {}): CreatePixPaymentInput {
  return {
    idempotencyKey: 'idem-1',
    orderMetadata: {
      orderId: 'order-1',
      workspaceId: 'ws-1',
      productName: 'Plano Pro',
    },
    buyerName: 'João Silva',
    buyerEmail: 'joao@example.com',
    buyerDocument: '12345678909',
    amountInCents: 13990,
    ...overrides,
  };
}

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

describe('MercadoPagoPixService', () => {
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

  describe('createPixPayment', () => {
    it('throws ServiceUnavailableException when MERCADOPAGO_ACCESS_TOKEN is not set', async () => {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;

      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        'Mercado Pago não configurado.',
      );
    });

    it('creates a Pix payment and returns normalized result', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeMpResponse(),
      });

      const result = await service.createPixPayment(makeInput());

      expect(result).toMatchObject({
        externalId: '123456789',
        status: 'pending',
        qrCode: '000201010212...',
        qrCodeBase64: 'base64png==',
        copyPaste: '000201010212...',
        expiresAt: '2026-05-06T22:59:59.000-03:00',
      } satisfies Partial<PixPaymentResult>);
      expect(result.providerRaw).toBeDefined();
      expect(result.providerRaw.id).toBe(123456789);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.mercadopago.com/v1/payments');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer TEST-123-ACCESS-TOKEN',
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'idem-1',
      });
    });

    it('includes payer with name, email, document, and phone when provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(
        makeInput({
          buyerPhone: '+5511999999999',
          buyerDocumentType: 'CNPJ',
        }),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const payer = body.payer as Record<string, unknown>;
      expect(payer.first_name).toBe('João');
      expect(payer.last_name).toBe('Silva');
      expect(payer.email).toBe('joao@example.com');
      expect(payer.identification).toEqual({ type: 'CNPJ', number: '12345678909' });
      expect(payer.phone).toEqual({ number: '+5511999999999' });
    });

    it('falls back single-name buyer to same first/last name', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput({ buyerName: 'Maria' }));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const payer = body.payer as Record<string, unknown>;
      expect(payer.first_name).toBe('Maria');
      expect(payer.last_name).toBe('Maria');
    });

    it('includes notification_url when provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(
        makeInput({ notificationUrl: 'https://webhook.example.com/mp' }),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.notification_url).toBe('https://webhook.example.com/mp');
    });

    it('omits phone from payload when not provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput({ buyerPhone: undefined }));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const payer = body.payer as Record<string, unknown>;
      expect(payer.phone).toBeUndefined();
    });

    it('omits notification_url from payload when not provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput({ notificationUrl: undefined }));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.notification_url).toBeUndefined();
    });

    it('uses productName as description when available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.description).toBe('Plano Pro');
    });

    it('falls back description to order id when productName is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(
        makeInput({ orderMetadata: { orderId: 'order-42', workspaceId: 'ws-1' } }),
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.description).toBe('Pedido order-42');
    });

    it('throws ServiceUnavailableException on network error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        'Falha de rede ao criar Pix no Mercado Pago.',
      );
    });

    it('throws ServiceUnavailableException on non-OK API response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'invalid payer' }),
      });

      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        'Mercado Pago rejeitou a criação do Pix.',
      );
    });

    it('throws ServiceUnavailableException when Mercado Pago returns invalid JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.createPixPayment(makeInput())).rejects.toThrow(
        'Mercado Pago retornou uma resposta inválida.',
      );
    });

    it('normalizes approved status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ status: 'approved' }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.status).toBe('approved');
    });

    it('normalizes rejected status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ status: 'rejected' }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.status).toBe('rejected');
    });

    it('normalizes cancelled status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ status: 'cancelled' }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.status).toBe('cancelled');
    });

    it('normalizes unknown status to pending', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ status: 'in_process' }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.status).toBe('pending');
    });

    it('returns null qr data when point_of_interaction is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ point_of_interaction: undefined }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.qrCode).toBeNull();
      expect(result.qrCodeBase64).toBeNull();
      expect(result.copyPaste).toBeNull();
    });

    it('returns null expiresAt when date_of_expiration is missing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse({ date_of_expiration: undefined }),
      });

      const result = await service.createPixPayment(makeInput());
      expect(result.expiresAt).toBeNull();
    });

    it('sanitizes providerRaw by masking document number', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeMpResponse({
            payer: {
              first_name: 'João',
              last_name: 'Silva',
              email: 'joao@example.com',
              identification: {
                type: 'CPF',
                number: '12345678909',
              },
            },
          }),
      });

      const result = await service.createPixPayment(makeInput());
      const payer = result.providerRaw.payer as Record<string, unknown>;
      const id = payer.identification as Record<string, unknown>;
      expect(id.number).toBe('***');
    });

    it('converts amountInCents to transaction_amount in reais', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput({ amountInCents: 5050 }));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.transaction_amount).toBe(50.5);
    });

    it('sets metadata with kloel order and workspace ids', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const metadata = body.metadata as Record<string, unknown>;
      expect(metadata).toEqual({
        kloel_order_id: 'order-1',
        workspace_id: 'ws-1',
      });
    });

    it('sets payment_method_id to pix', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.payment_method_id).toBe('pix');
    });

    it('uses 30s timeout on fetch', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => makeMpResponse(),
      });

      await service.createPixPayment(makeInput());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeDefined();
    });
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
