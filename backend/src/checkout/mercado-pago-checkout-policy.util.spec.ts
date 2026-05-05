import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('checkout migration guard — legacy gateway policy', () => {
  const retiredProvider = ['as', 'aas'].join('');

  it('keeps public checkout contracts free from retired provider session plumbing', () => {
    const controllerSource = readFileSync(
      resolve(__dirname, './checkout-public.controller.ts'),
      'utf8',
    );
    const dtoSource = readFileSync(resolve(__dirname, './dto/create-order.dto.ts'), 'utf8');

    expect(controllerSource.toLowerCase()).not.toContain(retiredProvider);
    expect(dtoSource.toLowerCase()).not.toContain(retiredProvider);
  });

  it('allows Mercado Pago Pix checkout integration when present', () => {
    // Mercado Pago Pix is intentionally allowed — the guard only
    // protects against retired provider re-introduction in checkout surfaces.
    const dtoSource = readFileSync(resolve(__dirname, './dto/create-order.dto.ts'), 'utf8');
    expect(dtoSource).toContain('PIX');
  });
});
