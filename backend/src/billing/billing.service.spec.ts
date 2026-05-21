import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { BillingService } from './billing.service';

// Stub the heavy collaborators to focus the test on BillingService's delegation contract.
jest.mock('./billing-subscription.service', () => ({
  BillingSubscriptionService: jest.fn().mockImplementation(() => ({
    getSubscription: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
    activateTrial: jest.fn().mockResolvedValue({ activated: true }),
    getUsage: jest.fn().mockResolvedValue({ messages: 0 }),
    cancelSubscription: jest.fn().mockResolvedValue({ cancelled: true }),
  })),
}));
jest.mock('./billing-checkout-webhook.service', () => ({
  BillingCheckoutWebhookService: jest.fn().mockImplementation(() => ({
    createCheckoutSession: jest.fn().mockResolvedValue({ url: 'https://stripe/test' }),
    handleWebhook: jest.fn().mockResolvedValue({ ok: true }),
  })),
}));
jest.mock('./billing-checkout-helper.service', () => ({
  BillingCheckoutHelperService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('./stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({})),
}));

describe('BillingService', () => {
  let service: BillingService;
  let prisma: object;
  let config: { get: jest.Mock };
  let moduleRef: object;

  beforeEach(async () => {
    prisma = {};
    config = { get: jest.fn().mockReturnValue(undefined) };
    moduleRef = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: FinancialAlertService, useValue: { paymentFailed: jest.fn() } },
      ],
    }).compile();
    service = module.get(BillingService);
  });

  it('delegates getSubscription to BillingSubscriptionService', async () => {
    await expect(service.getSubscription('ws-1')).resolves.toEqual({ workspaceId: 'ws-1' });
  });

  it('delegates activateTrial', async () => {
    await expect(service.activateTrial('ws-1')).resolves.toEqual({ activated: true });
  });

  it('delegates getUsage', async () => {
    await expect(service.getUsage('ws-1')).resolves.toEqual({ messages: 0 });
  });

  it('delegates createCheckoutSession to webhook service', async () => {
    await expect(
      service.createCheckoutSession('ws-1', 'PRO', 'user@test.com'),
    ).resolves.toEqual({ url: 'https://stripe/test' });
  });

  it('delegates handleWebhook', async () => {
    await expect(service.handleWebhook('sig', Buffer.from('{}'))).resolves.toEqual({ ok: true });
  });

  it('delegates cancelSubscription', async () => {
    await expect(service.cancelSubscription('ws-1')).resolves.toEqual({ cancelled: true });
  });

  it('reads STRIPE_SECRET_KEY at construction time', () => {
    expect(config.get).toHaveBeenCalledWith('STRIPE_SECRET_KEY');
  });
});
