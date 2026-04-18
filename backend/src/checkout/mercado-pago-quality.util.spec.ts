import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { CheckoutModule } from './checkout.module';

describe('checkout migration guard — quality surface', () => {
  it('keeps the checkout runtime mounted without the legacy checkout webhook controller', () => {
    const serviceSource = readFileSync(resolve(__dirname, './checkout.service.ts'), 'utf8');
    const controllers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CheckoutModule) || [];
    const controllerNames = controllers
      .filter((controller): controller is { name: string } => typeof controller === 'function')
      .map((controller) => controller.name);

    expect(controllerNames).not.toContain('CheckoutWebhookController');
    expect(serviceSource.toLowerCase()).not.toContain('mercado pago');
    expect(serviceSource.toLowerCase()).not.toContain('mercadopago');
    expect(serviceSource.toLowerCase()).not.toContain('asaas');
  });
});
