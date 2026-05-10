import { TestingModuleBuilder } from '@nestjs/testing';
import { CHECKOUT_PAYMENT_E2E_GUARD } from 'src/checkout/checkout-payment-e2e-guard';
import { KLOEL_COMPOSER_E2E_GUARD } from 'src/kloel/kloel-composer-e2e-guard';
import { KLOEL_LLM_E2E_GUARD } from 'src/kloel/kloel-llm-e2e-guard';
import { CheckoutPaymentE2EStubGuard } from './checkout-payment-e2e-stub';
import { KloelComposerE2EStubGuard } from './kloel-composer-web-search-e2e-stub';
import { KloelLLME2EStubGuard } from './kloel-llm-test-stub';

export function applyCheckoutPaymentE2EStub(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideProvider(CHECKOUT_PAYMENT_E2E_GUARD)
    .useClass(CheckoutPaymentE2EStubGuard);
}

export function applyKloelComposerE2EStub(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideProvider(KLOEL_COMPOSER_E2E_GUARD)
    .useClass(KloelComposerE2EStubGuard);
}

export function applyKloelLLME2EStub(builder: TestingModuleBuilder): TestingModuleBuilder {
  return builder
    .overrideProvider(KLOEL_LLM_E2E_GUARD)
    .useClass(KloelLLME2EStubGuard);
}

export function applyAllE2EStubs(builder: TestingModuleBuilder): TestingModuleBuilder {
  return applyKloelLLME2EStub(applyKloelComposerE2EStub(applyCheckoutPaymentE2EStub(builder)));
}
