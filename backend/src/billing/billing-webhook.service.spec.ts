import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { BillingWebhookService } from './billing-webhook.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

const constructEventMock = jest.fn();
const stripeMock = {
  webhooks: { constructEvent: constructEventMock },
};

jest.mock('./stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => stripeMock),
}));

jest.mock('./billing-webhook.fulfillment', () => ({
  fulfillCheckout: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-webhook.sync-subscription', () => ({
  syncSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-webhook.cancel', () => ({
  cancelSubscriptionByStripeId: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-subscription-status.helper', () => ({
  markSubscriptionStatusHelper: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-webhook.helpers', () => ({
  notifyOpsHelper: jest.fn().mockResolvedValue(undefined),
  readInvoiceSubscriptionId: jest.fn().mockReturnValue(null),
}));

describe('BillingWebhookService', () => {
  let service: BillingWebhookService;
  let config: { get: jest.Mock };
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let financialAlert: { webhookProcessingFailed: jest.Mock };
  let txCreate: jest.Mock;

  beforeEach(async () => {
    constructEventMock.mockReset();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_fake';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_fake';
        return undefined;
      }),
    };
    financialAlert = { webhookProcessingFailed: jest.fn() };

    const webhookEventFindFirst = jest.fn().mockResolvedValue(null);
    const webhookEventUpdate = jest.fn().mockResolvedValue({});
    txCreate = jest.fn();
    const $transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        webhookEvent: {
          findFirst: webhookEventFindFirst,
          create: txCreate,
        },
      }),
    );

    prisma = createPartialPrismaMock({
      webhookEvent: ['findFirst', 'create', 'update'],
      workspace: ['findFirst'],
    });
    prisma.webhookEvent.findFirst = webhookEventFindFirst;
    prisma.webhookEvent.create = txCreate;
    prisma.webhookEvent.update = webhookEventUpdate;
    prisma.$transaction = $transaction;
    prisma.workspace.findFirst = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingWebhookService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get(BillingWebhookService);
  });

  describe('handleWebhook', () => {
    it('throws when rawBody is missing', async () => {
      await expect(service.handleWebhook('sig', undefined as Buffer)).rejects.toThrow(
        'Missing rawBody or signature',
      );
    });

    it('throws when signature is missing', async () => {
      await expect(service.handleWebhook(undefined as string, Buffer.from('{}'))).rejects.toThrow(
        'Missing rawBody or signature',
      );
    });

    it('returns stripe_not_configured when StripeRuntime is absent', async () => {
      const noStripeConfig = { get: jest.fn().mockReturnValue(undefined) };
      const noStripeModule: TestingModule = await Test.createTestingModule({
        providers: [
          BillingWebhookService,
          { provide: ConfigService, useValue: noStripeConfig },
          { provide: PrismaService, useValue: prisma },
          { provide: ModuleRef, useValue: { get: jest.fn() } },
          { provide: FinancialAlertService, useValue: financialAlert },
          { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
        ],
      }).compile();
      const noStripeService = noStripeModule.get(BillingWebhookService);
      const result = await noStripeService.handleWebhook('sig', Buffer.from('{}'));
      expect(result).toEqual({ received: false, reason: 'stripe_not_configured' });
    });

    it('returns idempotent true when event was already processed', async () => {
      const validEvent = {
        type: 'checkout.session.completed',
        id: 'evt_dup',
        data: { object: {} },
      };
      constructEventMock.mockReturnValue(validEvent);
      prisma.webhookEvent.findFirst.mockResolvedValueOnce({ id: 'existing', status: 'processed' });

      const result = await service.handleWebhook('sig', Buffer.from('{}'));
      expect(result).toEqual({ received: true, idempotent: true });
    });

    it('returns idempotent true when P2002 unique constraint fires', async () => {
      const validEvent = {
        type: 'checkout.session.completed',
        id: 'evt_uq',
        data: { object: {} },
      };
      constructEventMock.mockReturnValue(validEvent);
      prisma.webhookEvent.findFirst.mockResolvedValueOnce(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5',
      });
      txCreate.mockReset();
      txCreate.mockRejectedValueOnce(p2002);

      const result = await service.handleWebhook('sig', Buffer.from('{}'));
      expect(result).toEqual({ received: true, idempotent: true });
    });

    it('processes checkout.session.completed with subscription mode', async () => {
      const session = {
        id: 'cs_test',
        mode: 'subscription',
        subscription: 'sub_test',
        customer: 'cus_test',
      };
      const validEvent = {
        type: 'checkout.session.completed',
        id: 'evt_happy',
        data: { object: session },
      };
      constructEventMock.mockReturnValue(validEvent);
      prisma.webhookEvent.findFirst.mockResolvedValueOnce(null);

      const result = await service.handleWebhook('sig', Buffer.from('{}'));
      expect(result).toEqual({ received: true });
      expect(txCreate).toHaveBeenCalled();
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'processed' }),
        }),
      );
    });
  });
});
