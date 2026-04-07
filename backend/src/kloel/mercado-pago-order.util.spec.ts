import {
  buildMercadoPagoAdditionalInfo,
  buildMercadoPagoOrderItems,
  buildMercadoPagoOrderPaymentRequest,
  normalizeMercadoPagoOrderPayment,
  normalizeMercadoPagoPayerAddress,
  normalizeMercadoPagoReceiverAddress,
} from './mercado-pago-order.util';

describe('mercado-pago-order.util', () => {
  describe('buildMercadoPagoOrderPaymentRequest', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-04-02T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('builds a Pix payment request with bank transfer and 30 minute expiration', () => {
      const payment = buildMercadoPagoOrderPaymentRequest({
        paymentMethod: 'PIX',
        amountInCents: 10000,
      });

      expect(payment).toMatchObject({
        amount: '100.00',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
        },
      });
      expect(payment.expiration_time).toBe('PT30M');
    });

    it('builds a boleto payment request with ticket method and 3 day expiration', () => {
      const payment = buildMercadoPagoOrderPaymentRequest({
        paymentMethod: 'BOLETO',
        amountInCents: 25990,
      });

      expect(payment).toMatchObject({
        amount: '259.90',
        payment_method: {
          id: 'boleto',
          type: 'ticket',
        },
      });
      expect(payment.expiration_time).toBe('P3D');
    });

    it('builds a credit card payment request with token and installments', () => {
      const payment = buildMercadoPagoOrderPaymentRequest({
        paymentMethod: 'CREDIT_CARD',
        amountInCents: 25990,
        cardToken: 'tok_test',
        cardPaymentMethodId: 'visa',
        installments: 3,
      });

      expect(payment).toEqual({
        amount: '259.90',
        payment_method: {
          id: 'visa',
          type: 'credit_card',
          token: 'tok_test',
          installments: 3,
          statement_descriptor: 'KLOEL',
        },
      });
    });
  });

  describe('normalizeMercadoPagoPayerAddress', () => {
    it('normalizes the public checkout shipping address for boleto requests', () => {
      expect(
        normalizeMercadoPagoPayerAddress({
          cep: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          complement: 'Conj. 101',
          city: 'São Paulo',
          state: 'SP',
        }),
      ).toEqual({
        zip_code: '01310100',
        street_name: 'Avenida Paulista',
        street_number: '1000',
        neighborhood: 'Bela Vista',
        complement: 'Conj. 101',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR',
      });
    });
  });

  describe('normalizeMercadoPagoReceiverAddress', () => {
    it('maps checkout address to receiver address fields', () => {
      expect(
        normalizeMercadoPagoReceiverAddress({
          cep: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          complement: 'Conj. 101',
          city: 'São Paulo',
          state: 'SP',
        }),
      ).toEqual({
        zip_code: '01310100',
        street_name: 'Avenida Paulista',
        street_number: '1000',
        apartment: 'Conj. 101',
        city_name: 'São Paulo',
        state_name: 'SP',
      });
    });
  });

  describe('buildMercadoPagoOrderItems', () => {
    it('creates order items with quantity and unit price', () => {
      expect(
        buildMercadoPagoOrderItems([
          {
            id: 'plan_1',
            title: 'Curso Kloel',
            description: 'Oferta principal',
            quantity: 2,
            unitPriceInCents: 14990,
            categoryId: 'digital_goods',
          },
        ]),
      ).toEqual([
        {
          title: 'Curso Kloel',
          description: 'Oferta principal',
          quantity: 2,
          unit_price: '149.90',
          category_id: 'digital_goods',
          external_code: 'plan_1',
          picture_url: undefined,
          warranty: false,
        },
      ]);
    });
  });

  describe('buildMercadoPagoAdditionalInfo', () => {
    it('includes registration date, ip and receiver address', () => {
      expect(
        buildMercadoPagoAdditionalInfo({
          customerName: 'Maria Oliveira',
          customerPhone: '(11) 99999-8888',
          customerRegistrationDate: '2026-04-01T10:00:00.000Z',
          ipAddress: '177.10.10.10',
          payerAddress: normalizeMercadoPagoPayerAddress({
            cep: '01310-100',
            street: 'Avenida Paulista',
            number: '1000',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
          }),
          receiverAddress: normalizeMercadoPagoReceiverAddress({
            cep: '01310-100',
            street: 'Avenida Paulista',
            number: '1000',
            city: 'São Paulo',
            state: 'SP',
          }),
          shippingPriceInCents: 1990,
          lineItems: [
            {
              id: 'plan_1',
              title: 'Curso Kloel',
              quantity: 1,
              unitPriceInCents: 14990,
              categoryId: 'digital_goods',
            },
          ],
        }),
      ).toMatchObject({
        ip_address: '177.10.10.10',
        payer: {
          first_name: 'Maria',
          last_name: 'Oliveira',
          registration_date: '2026-04-01T10:00:00.000Z',
          address: {
            zip_code: '01310100',
            street_name: 'Avenida Paulista',
            street_number: '1000',
          },
        },
        shipments: {
          cost: 19.9,
          receiver_address: {
            city_name: 'São Paulo',
            state_name: 'SP',
          },
        },
        items: [
          {
            id: 'plan_1',
            title: 'Curso Kloel',
            quantity: 1,
            unit_price: 149.9,
            category_id: 'digital_goods',
          },
        ],
      });
    });
  });

  describe('normalizeMercadoPagoOrderPayment', () => {
    it('extracts Pix instructions from the order response', () => {
      const payment = normalizeMercadoPagoOrderPayment({
        id: 'order_1',
        status: 'pending',
        expiration_time: '2026-04-02T12:30:00.000Z',
        transactions: {
          payments: [
            {
              id: 'pay_1',
              status: 'pending',
              payment_method: {
                id: 'pix',
                type: 'bank_transfer',
                qr_code: '000201010211',
                qr_code_base64: 'ZmFrZS1xci1iYXNlNjQ=',
              },
            },
          ],
        },
      } as any);

      expect(payment).toMatchObject({
        externalId: 'pay_1',
        status: 'pending',
        pixCopyPaste: '000201010211',
        pixQrCode: 'data:image/png;base64,ZmFrZS1xci1iYXNlNjQ=',
        pixExpiresAt: '2026-04-02T12:30:00.000Z',
        boletoUrl: null,
      });
    });

    it('extracts boleto instructions from the order response', () => {
      const payment = normalizeMercadoPagoOrderPayment({
        id: 'order_2',
        status: 'pending',
        transactions: {
          payments: [
            {
              id: 'pay_2',
              status: 'pending',
              date_of_expiration: '2026-04-05T12:00:00.000Z',
              payment_method: {
                id: 'boleto',
                type: 'ticket',
                ticket_url: 'https://mp.test/boleto.pdf',
                digitable_line: '23793.38128 60005.123456 78000.123456 1 00000000025990',
              },
            },
          ],
        },
      } as any);

      expect(payment).toMatchObject({
        externalId: 'pay_2',
        boletoUrl: 'https://mp.test/boleto.pdf',
        boletoBarcode: '23793.38128 60005.123456 78000.123456 1 00000000025990',
        boletoExpiresAt: '2026-04-05T12:00:00.000Z',
        pixCopyPaste: null,
      });
    });
  });
});
