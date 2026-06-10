import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { BillingWebhookService } from './billing-webhook.service';
import { partialMatch } from '../../test/helpers/match-instance';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { syncSubscriptionStatus } from './billing-webhook.sync-subscription';
import { cancelSubscriptionByStripeId } from './billing-webhook.cancel';
import { fulfillCheckout } from './billing-webhook.fulfillment';
import { markSubscriptionStatusHelper } from './billing-subscription-status.helper';
import { readInvoiceSubscriptionId } from './billing-webhook.helpers';

const constructEventMock = jest.fn();
const stripeMock = { webhooks: { constructEvent: constructEventMock } };

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
  ...jest.requireActual<typeof import('./billing-subscription-status.helper')>(
    './billing-subscription-status.helper',
  ),
  markSubscriptionStatusHelper: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-webhook.helpers', () => ({
  notifyOpsHelper: jest.fn().mockResolvedValue(undefined),
  readInvoiceSubscriptionId: jest.fn().mockReturnValue(null),
}));

const mockedSync = jest.mocked(syncSubscriptionStatus);
const mockedCancel = jest.mocked(cancelSubscriptionByStripeId);
const mockedFulfill = jest.mocked(fulfillCheckout);
const mockedMarkStatus = jest.mocked(markSubscriptionStatusHelper);
const mockedReadSubId = jest.mocked(readInvoiceSubscriptionId);

describe('BillingWebhookService event dispatch', () => {
  let service: BillingWebhookService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let financialAlert: { webhookProcessingFailed: jest.Mock };
  type WebhookUpdateArg = { data: { status: string } };
  let webhookEventUpdate: jest.Mock<Promise<unknown>, [WebhookUpdateArg]>;

  const buildEvent = (type: string, object: Record<string, unknown>, id = 'evt_x') => ({
    type,
    id,
    data: { object },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedSync.mockResolvedValue(undefined);
    mockedCancel.mockResolvedValue(undefined);
    mockedFulfill.mockResolvedValue(undefined);
    mockedMarkStatus.mockResolvedValue(undefined);
    mockedReadSubId.mockReturnValue(null);

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') {
          return 'sk_test_fake';
        }
        if (key === 'STRIPE_WEBHOOK_SECRET') {
          return 'whsec_fake';
        }
        return undefined;
      }),
    };
    financialAlert = { webhookProcessingFailed: jest.fn() };

    webhookEventUpdate = jest.fn<Promise<unknown>, [WebhookUpdateArg]>().mockResolvedValue({});
    prisma = createPartialPrismaMock({
      webhookEvent: ['findFirst', 'create', 'update'],
      workspace: ['findFirst'],
    });
    prisma.webhookEvent.findFirst = jest.fn().mockResolvedValue(null);
    prisma.webhookEvent.create = jest.fn().mockResolvedValue({});
    prisma.webhookEvent.update = webhookEventUpdate;
    prisma.$transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        webhookEvent: {
          findFirst: prisma.webhookEvent.findFirst,
          create: prisma.webhookEvent.create,
        },
      }),
    );
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

  it('rejects an invalid signature and raises a financial alert (no money path)', async () => {
    const verifyError = new Error('No signatures found matching');
    constructEventMock.mockImplementation(() => {
      throw verifyError;
    });
    await expect(service.handleWebhook('bad-sig', Buffer.from('{}'))).rejects.toThrow(
      'Webhook signature verification failed',
    );
    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(
      verifyError,
      partialMatch({ provider: 'stripe' }),
    );
    // No webhookEvent row is created when the signature cannot be verified.
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('routes customer.subscription.updated to syncSubscriptionStatus and marks processed', async () => {
    const sub = { id: 'sub_upd', customer: 'cus_1' };
    constructEventMock.mockReturnValue(buildEvent('customer.subscription.updated', sub, 'evt_upd'));
    const result = await service.handleWebhook('sig', Buffer.from('{}'));
    expect(result).toEqual({ received: true });
    expect(mockedSync).toHaveBeenCalledTimes(1);
    expect(mockedSync.mock.calls[0][1]).toEqual(sub);
    expect(webhookEventUpdate).toHaveBeenCalledWith(
      partialMatch({ data: partialMatch({ status: 'processed' }) }),
    );
  });

  it('routes customer.subscription.deleted to cancelSubscriptionByStripeId with the sub id', async () => {
    constructEventMock.mockReturnValue(
      buildEvent('customer.subscription.deleted', { id: 'sub_del' }, 'evt_del'),
    );
    await service.handleWebhook('sig', Buffer.from('{}'));
    expect(mockedCancel).toHaveBeenCalledTimes(1);
    expect(mockedCancel.mock.calls[0][1]).toBe('sub_del');
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it('marks the subscription PAST_DUE on invoice.payment_failed', async () => {
    mockedReadSubId.mockReturnValue('sub_pf');
    constructEventMock.mockReturnValue(
      buildEvent('invoice.payment_failed', { subscription: 'sub_pf' }, 'evt_pf'),
    );
    await service.handleWebhook('sig', Buffer.from('{}'));
    expect(mockedMarkStatus.mock.calls[0][1]).toBe('sub_pf');
    expect(mockedMarkStatus.mock.calls[0][2]).toBe('PAST_DUE');
  });

  it('marks the subscription ACTIVE on invoice.payment_succeeded', async () => {
    mockedReadSubId.mockReturnValue('sub_ok');
    constructEventMock.mockReturnValue(
      buildEvent('invoice.payment_succeeded', { subscription: 'sub_ok' }, 'evt_ok'),
    );
    await service.handleWebhook('sig', Buffer.from('{}'));
    expect(mockedMarkStatus.mock.calls[0][1]).toBe('sub_ok');
    expect(mockedMarkStatus.mock.calls[0][2]).toBe('ACTIVE');
  });

  it('skips status change when the invoice carries no subscription id', async () => {
    mockedReadSubId.mockReturnValue(null);
    constructEventMock.mockReturnValue(buildEvent('invoice.payment_failed', {}, 'evt_nosub'));
    const result = await service.handleWebhook('sig', Buffer.from('{}'));
    expect(result).toEqual({ received: true });
    expect(mockedMarkStatus).not.toHaveBeenCalled();
  });

  it('does NOT fulfill a checkout.session.completed in one-time payment mode (no subscription)', async () => {
    constructEventMock.mockReturnValue(
      buildEvent('checkout.session.completed', { mode: 'payment', subscription: null }, 'evt_pay'),
    );
    await service.handleWebhook('sig', Buffer.from('{}'));
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it('fulfills a checkout.session.completed that carries a subscription even without mode', async () => {
    const session = { mode: undefined, subscription: 'sub_inline' };
    constructEventMock.mockReturnValue(
      buildEvent('checkout.session.completed', session, 'evt_inline'),
    );
    await service.handleWebhook('sig', Buffer.from('{}'));
    expect(mockedFulfill).toHaveBeenCalledTimes(1);
  });

  it('ignores unrecognized event types but still marks the event processed', async () => {
    constructEventMock.mockReturnValue(buildEvent('charge.refunded', {}, 'evt_unk'));
    const result = await service.handleWebhook('sig', Buffer.from('{}'));
    expect(result).toEqual({ received: true });
    expect(mockedFulfill).not.toHaveBeenCalled();
    expect(mockedSync).not.toHaveBeenCalled();
    expect(webhookEventUpdate).toHaveBeenCalledWith(
      partialMatch({ data: partialMatch({ status: 'processed' }) }),
    );
  });

  it('on handler failure marks the event failed (retryable, NOT processed) and alerts', async () => {
    const handlerError = new Error('downstream sync blew up');
    mockedSync.mockRejectedValueOnce(handlerError);
    constructEventMock.mockReturnValue(
      buildEvent('customer.subscription.updated', { id: 'sub_boom' }, 'evt_boom'),
    );

    await expect(service.handleWebhook('sig', Buffer.from('{}'))).rejects.toThrow(
      'downstream sync blew up',
    );
    // The event is persisted as failed (so a Stripe retry can re-run it) and
    // is never marked processed — the idempotency guard would otherwise swallow
    // the retry of a half-applied event.
    expect(webhookEventUpdate).toHaveBeenCalledWith(
      partialMatch({ data: partialMatch({ status: 'failed' }) }),
    );
    const processedCalls = webhookEventUpdate.mock.calls.filter(
      (call) => call[0].data.status === 'processed',
    );
    expect(processedCalls).toHaveLength(0);
    expect(financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(
      handlerError,
      partialMatch({ provider: 'stripe', eventType: 'customer.subscription.updated' }),
    );
  });

  describe('resolveWorkspaceId (workspace isolation)', () => {
    it('prefers the workspaceId carried in subscription metadata over a customer lookup', async () => {
      const resolved = await service['resolveWorkspaceId']({
        metadata: { workspaceId: 'ws-from-meta' },
        customer: 'cus_other',
      } as never);
      expect(resolved).toBe('ws-from-meta');
      expect(prisma.workspace.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to a stripeCustomerId-scoped workspace lookup when metadata is absent', async () => {
      prisma.workspace.findFirst = jest.fn().mockResolvedValue({ id: 'ws-by-customer' });
      const resolved = await service['resolveWorkspaceId']({
        metadata: null,
        customer: 'cus_42',
      } as never);
      expect(resolved).toBe('ws-by-customer');
      expect(prisma.workspace.findFirst).toHaveBeenCalledWith(
        partialMatch({ where: { stripeCustomerId: 'cus_42' } }),
      );
    });

    it('returns null when there is neither metadata nor a customer id', async () => {
      const resolved = await service['resolveWorkspaceId']({
        metadata: null,
        customer: null,
      } as never);
      expect(resolved).toBeNull();
    });
  });
});
