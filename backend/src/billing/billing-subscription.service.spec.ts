import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSubscriptionService } from './billing-subscription.service';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';
import type { StripeClient } from './stripe-types';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('BillingSubscriptionService', () => {
  let service: BillingSubscriptionService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let configService: ConfigService;
  let stripe: { subscriptions: { retrieve: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    const txPrisma = createPartialPrismaMock({
      subscription: ['findUnique', 'findFirst', 'update', 'updateMany', 'upsert'],
      message: ['count'],
      flow: ['count'],
      contact: ['count'],
      workspace: ['findUnique', 'update'],
      auditLog: ['create'],
    });
    txPrisma.subscription.update.mockResolvedValue({});
    txPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    txPrisma.subscription.upsert.mockResolvedValue({});
    txPrisma.message.count.mockResolvedValue(0);
    txPrisma.flow.count.mockResolvedValue(0);
    txPrisma.contact.count.mockResolvedValue(0);
    txPrisma.workspace.update.mockResolvedValue({});
    txPrisma.auditLog.create.mockResolvedValue({});
    txPrisma.$transaction = jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        subscription: txPrisma.subscription,
        auditLog: txPrisma.auditLog,
      }),
    );
    prisma = txPrisma;
    configService = new ConfigService({ TRIAL_DAYS: '7', TRIAL_CREDITS_USD: '5' });
    stripe = {
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new BillingSubscriptionService(
      prisma as unknown as PrismaService,
      configService,
      {} as ModuleRef,
      stripe as StripeClient,
      {} as BillingCheckoutHelperService,
    );
  });

  describe('normalizeSubscriptionStatus', () => {
    it('uppercases and trims', () => {
      expect(service.normalizeSubscriptionStatus('  active  ')).toBe('ACTIVE');
      expect(service.normalizeSubscriptionStatus(null)).toBe('');
    });
  });

  describe('getSubscription', () => {
    it('returns FREE shape when no subscription exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      const result = await service.getSubscription('ws-1');
      expect(result).toEqual({
        status: 'none',
        plan: 'FREE',
        trialDaysLeft: 0,
        creditsBalance: 0,
        cancelAtPeriodEnd: false,
      });
    });

    it('maps status: ACTIVE→active, CANCELED→expired, TRIAL→trial', async () => {
      const futureEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'TRIAL',
        plan: 'STARTER',
        stripeId: null,
        currentPeriodEnd: futureEnd,
        cancelAtPeriodEnd: false,
      });
      const trial = await service.getSubscription('ws-1');
      expect(trial.status).toBe('trial');
      expect(trial.trialDaysLeft).toBeGreaterThanOrEqual(4);
      expect(trial.creditsBalance).toBe(5);

      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        plan: 'PRO',
        stripeId: null,
        currentPeriodEnd: futureEnd,
        cancelAtPeriodEnd: false,
      });
      const active = await service.getSubscription('ws-1');
      expect(active.status).toBe('active');

      prisma.subscription.findUnique.mockResolvedValue({
        status: 'CANCELED',
        plan: 'STARTER',
        stripeId: null,
        currentPeriodEnd: futureEnd,
        cancelAtPeriodEnd: true,
      });
      const canceled = await service.getSubscription('ws-1');
      expect(canceled.status).toBe('expired');
    });
  });

  describe('activateTrial', () => {
    it('no-ops (returns existing) when already ACTIVE or TRIAL', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({ status: 'ACTIVE', plan: 'PRO' }) // first lookup
        .mockResolvedValueOnce({
          status: 'ACTIVE',
          plan: 'PRO',
          stripeId: null,
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false,
        }); // second lookup inside getSubscription
      await service.activateTrial('ws-1');
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('upserts subscription with TRIAL status when no active subscription', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'TRIAL',
          plan: 'STARTER',
          stripeId: null,
          currentPeriodEnd: new Date(Date.now() + 7 * 86400_000),
          cancelAtPeriodEnd: false,
        });
      await service.activateTrial('ws-1');
      expect(prisma.subscription.upsert).toHaveBeenCalled();
      const upsertCall = prisma.subscription.upsert.mock.calls[0][0];
      expect(upsertCall.create.status).toBe('TRIAL');
      expect(upsertCall.update.status).toBe('TRIAL');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'TRIAL_ACTIVATED',
        }),
      });
    });
  });

  describe('getUsage', () => {
    it('returns counts scoped per workspace (parallel)', async () => {
      prisma.message.count.mockResolvedValue(123);
      prisma.flow.count.mockResolvedValue(5);
      prisma.contact.count.mockResolvedValue(99);
      const result = await service.getUsage('ws-1');
      expect(result).toEqual({ messages: 123, flows: 5, contacts: 99 });
      expect(prisma.message.count.mock.calls[0][0].where.workspaceId).toBe('ws-1');
      expect(prisma.message.count.mock.calls[0][0].where.direction).toBe('OUTBOUND');
    });
  });

  describe('cancelSubscription', () => {
    it('returns no_subscription when none exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.cancelSubscription('ws-1')).resolves.toEqual({
        status: 'no_subscription',
      });
    });

    it('calls Stripe with cancel_at_period_end=true and updates DB', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        stripeId: 'sub_X',
      });
      const result = await service.cancelSubscription('ws-1');
      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_X', {
        cancel_at_period_end: true,
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        data: { status: 'CANCELED' },
      });
      expect(result.status).toBe('canceled');
    });

    it('refuses to mark CANCELED when Stripe cancel fails (no DB drift)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        stripeId: 'sub_X',
      });
      stripe.subscriptions.update.mockRejectedValue(new Error('Stripe down'));
      await expect(service.cancelSubscription('ws-1')).rejects.toThrow(/Failed to cancel/);
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('activatePlanFeatures', () => {
    it('writes plan limits and clears billingSuspended for PRO', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });
      await service.activatePlanFeatures('ws-1', 'PRO');
      const update = prisma.workspace.update.mock.calls[0][0];
      expect(update.data.providerSettings.billingSuspended).toBe(false);
      expect(update.data.providerSettings.plan.name).toBe('PRO');
      expect(update.data.providerSettings.plan.limits.monthlyMessages).toBe(10000);
      expect(update.data.providerSettings.autopilot.enabled).toBe(true);
    });

    it('falls back to STARTER limits for unknown plan', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      await service.activatePlanFeatures('ws-1', 'UNKNOWN_PLAN');
      const update = prisma.workspace.update.mock.calls[0][0];
      expect(update.data.providerSettings.plan.limits.monthlyMessages).toBe(1000);
    });
  });
});
