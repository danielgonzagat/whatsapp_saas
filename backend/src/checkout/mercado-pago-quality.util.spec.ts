import { assertMercadoPagoCheckoutQuality } from './mercado-pago-quality.util';

describe('mercado-pago-quality.util', () => {
  it('accepts a fully qualified checkout payload', () => {
    expect(
      assertMercadoPagoCheckoutQuality({
        customerName: 'Maria Oliveira',
        customerEmail: 'maria@example.com',
        customerCPF: '123.456.789-09',
        customerPhone: '(11) 99999-8888',
        meliSessionId: 'device-session-123456',
        shippingAddress: {
          cep: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
      }),
    ).toMatchObject({
      documentDigits: '12345678909',
      phoneDigits: '11999998888',
      meliSessionId: 'device-session-123456',
      payerAddress: {
        street_name: 'Avenida Paulista',
        street_number: '1000',
        zip_code: '01310100',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
  });

  it('rejects checkout without device session id', () => {
    expect(() =>
      assertMercadoPagoCheckoutQuality({
        customerName: 'Maria Oliveira',
        customerEmail: 'maria@example.com',
        customerCPF: '123.456.789-09',
        customerPhone: '(11) 99999-8888',
        shippingAddress: {
          cep: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
      }),
    ).toThrow('Não foi possível validar este dispositivo');
  });
});
