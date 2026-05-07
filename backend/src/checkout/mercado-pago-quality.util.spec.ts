import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { CheckoutModule } from './checkout.module';

describe('checkout migration guard — quality surface', () => {
  const retiredProvider = ['as', 'aas'].join('');

  it('keeps the checkout runtime mounted without the legacy checkout webhook controller', () => {
    const serviceSource = readFileSync(resolve(__dirname, './checkout.service.ts'), 'utf8');
    const controllers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CheckoutModule) || [];
    const controllerNames = controllers
      .filter((controller): controller is { name: string } => typeof controller === 'function')
      .map((controller) => controller.name);

    expect(controllerNames).not.toContain('CheckoutWebhookController');
    expect(serviceSource.toLowerCase()).not.toContain(retiredProvider);
  });

  it('allows Mercado Pago Pix provider in checkout service when present', () => {
    // Mercado Pago Pix checkout is intentionally allowed — the guard
    // only blocks retired provider re-introduction in the checkout service surface.
    const providerSource = readFileSync(
      resolve(__dirname, './mercado-pago-pix.service.ts'),
      'utf8',
    );
    expect(providerSource).toContain('MERCADOPAGO_ACCESS_TOKEN');
    expect(providerSource).toContain('qr_code');
  });
});
