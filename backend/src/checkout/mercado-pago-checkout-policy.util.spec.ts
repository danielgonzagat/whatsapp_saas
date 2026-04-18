import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('checkout migration guard — legacy gateway policy', () => {
  it('keeps public checkout contracts free from Mercado Pago session plumbing', () => {
    const controllerSource = readFileSync(
      resolve(__dirname, './checkout-public.controller.ts'),
      'utf8',
    );
    const dtoSource = readFileSync(resolve(__dirname, './dto/create-order.dto.ts'), 'utf8');

    expect(controllerSource).not.toContain('X-Meli-Session-Id');
    expect(controllerSource.toLowerCase()).not.toContain('mercado pago');
    expect(controllerSource.toLowerCase()).not.toContain('mercadopago');
    expect(dtoSource.toLowerCase()).not.toContain('meli');
    expect(dtoSource.toLowerCase()).not.toContain('mercado');
  });
});
