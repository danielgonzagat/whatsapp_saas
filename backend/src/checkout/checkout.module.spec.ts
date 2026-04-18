import { MODULE_METADATA } from '@nestjs/common/constants';

import { CheckoutModule } from './checkout.module';

describe('CheckoutModule', () => {
  it('does not expose legacy checkout webhook controllers once the checkout runtime is Stripe-only', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CheckoutModule) || [];
    const controllerNames = controllers
      .filter((controller): controller is { name: string } => typeof controller === 'function')
      .map((controller) => controller.name);

    expect(controllerNames).not.toContain('CheckoutWebhookController');
  });
});
