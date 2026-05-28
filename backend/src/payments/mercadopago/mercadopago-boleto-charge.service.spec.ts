import { MercadoPagoBoletoChargeService } from './mercadopago-boleto-charge.service';
import type { MercadoPagoConfigService } from './mercadopago.config';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

describe('MercadoPagoBoletoChargeService', () => {
  let fetchMock: FetchMock;
  let config: Pick<MercadoPagoConfigService, 'baseUrl' | 'get' | 'isAvailable'>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    config = {
      baseUrl: 'https://api.mercadopago.com',
      get: jest.fn().mockReturnValue({
        accessToken: 'TEST-123',
        publicKey: 'APP_USR-public',
        sandbox: true,
        webhookSecret: 'secret',
      }),
      isAvailable: jest.fn().mockReturnValue(true),
    };
  });

  it('creates boleto payment with Mercado Pago boleto rail and parses ticket proof', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 123456,
          status: 'pending',
          transaction_details: {
            barcode_content: '23793381286000000000123456789012345678901234',
            digitable_line: '23793.38128 60000.000001 12345.678901 2 99990000013990',
            external_resource_url: 'https://www.mercadopago.com.br/payments/123456/ticket',
          },
        }),
        { status: 201 },
      ),
    );
    const service = new MercadoPagoBoletoChargeService(config as MercadoPagoConfigService);
    const expiresAt = new Date('2026-06-03T12:00:00.000Z');

    const result = await service.create({
      amountCents: 13_990n,
      description: 'Produto X',
      externalReference: 'order-1',
      expiresAt,
      idempotencyKey: 'idem-boleto-1',
      notificationUrl: 'https://api.kloel.com/webhooks/mercadopago',
      payerAddress: {
        city: 'Sao Paulo',
        neighborhood: 'Bela Vista',
        number: '1000',
        state: 'SP',
        street: 'Av Paulista',
        zipCode: '01310100',
      },
      payerDocument: '12345678909',
      payerEmail: 'boleto@example.com',
      payerName: 'Cliente Boleto',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer TEST-123',
          'X-Idempotency-Key': 'idem-boleto-1',
        }),
      }),
    );
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      date_of_expiration: expiresAt.toISOString(),
      external_reference: 'order-1',
      notification_url: 'https://api.kloel.com/webhooks/mercadopago',
      payer: {
        address: {
          city: 'Sao Paulo',
          federal_unit: 'SP',
          street_name: 'Av Paulista',
          street_number: '1000',
          zip_code: '01310100',
        },
        email: 'boleto@example.com',
        identification: { number: '12345678909', type: 'CPF' },
      },
      payment_method_id: 'bolbradesco',
      transaction_amount: 139.9,
    });
    expect(result).toMatchObject({
      barcodeContent: '23793381286000000000123456789012345678901234',
      digitableLine: '23793.38128 60000.000001 12345.678901 2 99990000013990',
      externalId: '123456',
      status: 'pending',
      ticketUrl: 'https://www.mercadopago.com.br/payments/123456/ticket',
    });
  });

  it('fails honestly when Mercado Pago omits boleto proof fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 123456, status: 'pending', transaction_details: {} }), {
        status: 201,
      }),
    );
    const service = new MercadoPagoBoletoChargeService(config as MercadoPagoConfigService);

    await expect(
      service.create({
        amountCents: 13_990n,
        description: 'Produto X',
        externalReference: 'order-1',
        expiresAt: new Date('2026-06-03T12:00:00.000Z'),
        idempotencyKey: 'idem-boleto-1',
        notificationUrl: 'https://api.kloel.com/webhooks/mercadopago',
        payerAddress: {
          city: 'Sao Paulo',
          number: '1000',
          state: 'SP',
          street: 'Av Paulista',
          zipCode: '01310100',
        },
        payerDocument: '12345678909',
        payerEmail: 'boleto@example.com',
        payerName: 'Cliente Boleto',
      }),
    ).rejects.toThrow('mp_boleto_response_missing_payment_data');
  });
});
