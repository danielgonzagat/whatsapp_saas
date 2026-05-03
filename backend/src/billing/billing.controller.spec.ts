import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

jest.mock('@nestjs/throttler', () => {
  const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
  return {
    ...actual,
    ThrottlerGuard: class SpecThrottlerGuard {
      canActivate() {
        return true;
      }
    },
  };
});

import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

type BillingWebhookResult = { received: boolean; reason?: string; idempotent?: boolean };

type BillingServiceStub = {
  handleWebhook: jest.Mock<Promise<BillingWebhookResult>, [string, Buffer]>;
};

function buildBillingServiceStub(): BillingServiceStub {
  return {
    handleWebhook: jest.fn(),
  };
}

async function buildController(stub: BillingServiceStub): Promise<BillingController> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [BillingController],
    providers: [{ provide: BillingService, useValue: stub }],
  }).compile();

  return moduleRef.get(BillingController);
}

describe('BillingController.handleWebhook', () => {
  beforeEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    jest.resetModules();
  });

  it('rejects webhook calls without stripe-signature header', async () => {
    const stub = buildBillingServiceStub();
    stub.handleWebhook.mockResolvedValue({ received: true });
    const controller = await buildController(stub);

    await expect(
      controller.handleWebhook(
        undefined as unknown as string,
        { rawBody: Buffer.from('{"id":"evt_1"}') } as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(stub.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects webhook calls without rawBody for signature verification', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const stub = buildBillingServiceStub();
    const controller = await buildController(stub);

    await expect(
      controller.handleWebhook('t=1,v1=test', { rawBody: undefined } as never),
    ).rejects.toThrow('Missing rawBody for Stripe webhook verification');
    expect(stub.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects webhook calls when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const stub = buildBillingServiceStub();
    const controller = await buildController(stub);

    await expect(
      controller.handleWebhook('t=1,v1=test', { rawBody: Buffer.from('{"id":"evt_1"}') } as never),
    ).rejects.toThrow('Stripe webhook secret not configured');
    expect(stub.handleWebhook).not.toHaveBeenCalled();
  });

  it('delegates validly signed payload to billing service', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const expectedBody = Buffer.from('{"id":"evt_1","type":"event"}');
    const expectedSignature = 't=1,v1=test';
    const stub = buildBillingServiceStub();
    stub.handleWebhook.mockResolvedValue({ received: true });
    const controller = await buildController(stub);

    const result = await controller.handleWebhook(expectedSignature, {
      rawBody: expectedBody,
    } as never);

    expect(stub.handleWebhook).toHaveBeenCalledWith(expectedSignature, expectedBody);
    expect(result).toEqual({ received: true });
  });
});
