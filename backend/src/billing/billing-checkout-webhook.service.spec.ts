import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';
import { BillingCheckoutWebhookService } from './billing-checkout-webhook.service';

type PrismaMock = PrismaService & {
  $transaction: jest.Mock<Promise<unknown>, [unknown, unknown?]>;
};

function buildService(env: string | undefined, billingMockMode: string | undefined) {
  const prisma = {
    $transaction: jest.fn<Promise<unknown>, [unknown, unknown?]>(),
  } as PrismaMock;
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') {
        return env;
      }
      if (key === 'BILLING_MOCK_MODE') {
        return billingMockMode;
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new BillingCheckoutWebhookService(
    prisma,
    configService,
    {} as ModuleRef,
    undefined,
    {} as BillingCheckoutHelperService,
  );

  return { prisma, service };
}

describe('BillingCheckoutWebhookService mock mode guard', () => {
  it('rejects billing mock mode in production when Stripe is unavailable', async () => {
    const { prisma, service } = buildService('production', 'true');

    await expect(
      service.createCheckoutSession('ws_prod', 'PRO', 'owner@example.com'),
    ).rejects.toThrow('Infraestrutura de cobrança indisponível em produção');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unavailable billing when mock mode is disabled outside production', async () => {
    const { prisma, service } = buildService('development', undefined);

    await expect(
      service.createCheckoutSession('ws_dev', 'STARTER', 'owner@example.com'),
    ).rejects.toThrow('Infraestrutura de cobrança indisponível');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
