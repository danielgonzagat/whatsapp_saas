import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';
import type { StripeClient } from './stripe-types';

describe('BillingCheckoutHelperService', () => {
  let service: BillingCheckoutHelperService;
  let prisma: {
    contact: { findFirst: jest.Mock };
    subscription: { findFirst: jest.Mock; update: jest.Mock };
    workspace: { findUnique: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let moduleRef: { get: jest.Mock };
  let stripe: Partial<StripeClient>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      subscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb({
          subscription: prisma.subscription,
          workspace: prisma.workspace,
          auditLog: prisma.auditLog,
        });
      }),
    };
    moduleRef = { get: jest.fn().mockReturnValue(null) };
    stripe = {
      subscriptions: { retrieve: jest.fn() } as never,
    };
    service = new BillingCheckoutHelperService(
      prisma as unknown as PrismaService,
      new ConfigService(),
      moduleRef as unknown as ModuleRef,
      stripe as StripeClient,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('markSubscriptionStatus', () => {
    it('suspends workspace on PAST_DUE: disables autopilot, sets billingSuspended, audits', async () => {
      prisma.subscription.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { autopilot: { enabled: true } },
      });
      await service.markSubscriptionStatus('sub_123', 'PAST_DUE');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        data: { status: 'PAST_DUE' },
      });
      const wsUpdate = prisma.workspace.update.mock.calls[0][0];
      expect(wsUpdate.data.providerSettings.billingSuspended).toBe(true);
      expect(wsUpdate.data.providerSettings.autopilot.enabled).toBe(false);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'SUBSCRIPTION_STATUS',
          details: { status: 'PAST_DUE', billingSuspended: true },
        }),
      });
    });

    it('reactivates workspace on ACTIVE: clears billingSuspended', async () => {
      prisma.subscription.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true, autopilot: { enabled: false } },
      });
      await service.markSubscriptionStatus('sub_123', 'ACTIVE');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        data: { status: 'ACTIVE' },
      });
      expect(prisma.workspace.update).toHaveBeenCalled();
      const wsUpdate = prisma.workspace.update.mock.calls[0][0];
      expect(wsUpdate.data.providerSettings.billingSuspended).toBeUndefined();
    });

    it('updates only subscription.status for other statuses', async () => {
      prisma.subscription.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      await service.markSubscriptionStatus('sub_123', 'PAUSED');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        data: { status: 'PAUSED' },
      });
      expect(prisma.workspace.update).not.toHaveBeenCalled();
    });

    it('no-ops when no workspace can be resolved', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      (stripe.subscriptions!.retrieve as jest.Mock).mockRejectedValue(new Error('not found'));
      await service.markSubscriptionStatus('sub_unknown', 'PAST_DUE');
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('notifyOps', () => {
    it('no-ops when no webhook URL configured', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      const originalWebhook = process.env.OPS_WEBHOOK_URL;
      delete process.env.OPS_WEBHOOK_URL;
      delete process.env.DLQ_WEBHOOK_URL;
      await service.notifyOps('test', { foo: 'bar' });
      expect(fetchMock).not.toHaveBeenCalled();
      if (originalWebhook) process.env.OPS_WEBHOOK_URL = originalWebhook;
    });
  });
});
