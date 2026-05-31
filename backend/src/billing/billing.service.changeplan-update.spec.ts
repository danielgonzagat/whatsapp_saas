import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { BillingService } from './billing.service';

// Heavy sub-services are irrelevant to changePlan/update — stub them out.
jest.mock('./billing-subscription.service', () => ({
  BillingSubscriptionService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('./billing-checkout-webhook.service', () => ({
  BillingCheckoutWebhookService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('./billing-checkout-helper.service', () => ({
  BillingCheckoutHelperService: jest.fn().mockImplementation(() => ({})),
}));

// Stripe billing-portal session create is the only Stripe surface used by update().
const portalCreate = jest.fn();
jest.mock('./stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    billingPortal: { sessions: { create: portalCreate } },
  })),
}));

type SubscriptionMock = {
  findUnique: jest.Mock;
  upsert: jest.Mock<Promise<unknown>, [SubscriptionUpsertArgs]>;
};
type WorkspaceMock = {
  findUnique: jest.Mock;
};
interface SubscriptionUpsertArgs {
  where: Record<string, unknown>;
  update: Record<string, unknown>;
  create: Record<string, unknown> & { currentPeriodEnd?: unknown };
}

describe('BillingService.changePlan + update', () => {
  let service: BillingService;
  let subscription: SubscriptionMock;
  let workspace: WorkspaceMock;

  const buildService = async (configValues: Record<string, string | undefined>) => {
    subscription = {
      findUnique: jest.fn(),
      upsert: jest.fn<Promise<unknown>, [SubscriptionUpsertArgs]>().mockResolvedValue({}),
    };
    workspace = { findUnique: jest.fn() };
    const prisma = { subscription, workspace };
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ModuleRef, useValue: {} },
        { provide: FinancialAlertService, useValue: { paymentFailed: jest.fn() } },
      ],
    }).compile();
    return module.get(BillingService);
  };

  beforeEach(() => {
    portalCreate.mockReset();
  });

  describe('changePlan', () => {
    beforeEach(async () => {
      service = await buildService({ STRIPE_SECRET_KEY: undefined });
    });

    it('rejects a missing plan with an honest error (no DB write)', async () => {
      const result = await service.changePlan('ws-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Parâmetro obrigatório');
      expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('rejects an invalid plan name', async () => {
      const result = await service.changePlan('ws-1', { plan: 'galaxy' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plano inválido');
      expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('directs a Stripe-managed subscription to the billing portal WITHOUT mutating the plan', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'STARTER', stripeId: 'sub_live' });
      const result = await service.changePlan('ws-1', { plan: 'pro' });
      expect(result).toMatchObject({
        success: true,
        requiresAction: true,
        currentPlan: 'STARTER',
        targetPlan: 'PRO',
      });
      // No money is moved and no local plan mutation happens under a Stripe sub.
      expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('directs a FREE->paid upgrade to checkout WITHOUT activating the plan', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'FREE', stripeId: null });
      const result = await service.changePlan('ws-1', { plan: 'pro' });
      expect(result).toMatchObject({
        success: true,
        requiresCheckout: true,
        targetPlan: 'PRO',
      });
      expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('treats a workspace with no subscription as FREE and routes paid upgrades to checkout', async () => {
      subscription.findUnique.mockResolvedValue(null);
      const result = await service.changePlan('ws-1', { newPlan: 'enterprise' });
      expect(result).toMatchObject({
        success: true,
        requiresCheckout: true,
        targetPlan: 'ENTERPRISE',
      });
      expect(subscription.upsert).not.toHaveBeenCalled();
    });

    it('upserts the record for a local FREE-tier transition', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'PRO', stripeId: null });
      const result = await service.changePlan('ws-1', { plan: 'free' });
      expect(result).toMatchObject({ success: true, previousPlan: 'PRO', newPlan: 'FREE' });
      expect(subscription.upsert).toHaveBeenCalledTimes(1);
      const call = subscription.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ workspaceId: 'ws-1' });
      expect(call.update).toEqual({ plan: 'FREE' });
      expect(call.create).toMatchObject({ workspaceId: 'ws-1', plan: 'FREE', status: 'ACTIVE' });
      expect(call.create.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it('is idempotent on replay — second identical call converges to the same upsert', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'STARTER', stripeId: null });
      await service.changePlan('ws-1', { plan: 'starter' });
      await service.changePlan('ws-1', { plan: 'starter' });
      expect(subscription.upsert).toHaveBeenCalledTimes(2);
      const [first, second] = subscription.upsert.mock.calls;
      expect(first[0].update).toEqual(second[0].update);
      expect(first[0].where).toEqual(second[0].where);
    });

    it('accepts the legacy newPlan alias', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'STARTER', stripeId: null });
      const result = await service.changePlan('ws-1', { newPlan: 'enterprise' });
      expect(result).toMatchObject({ success: true, newPlan: 'ENTERPRISE' });
    });

    it('scopes the lookup to the workspace', async () => {
      subscription.findUnique.mockResolvedValue({ plan: 'STARTER', stripeId: null });
      await service.changePlan('ws-42', { plan: 'starter' });
      expect(subscription.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-42' } }),
      );
    });
  });

  describe('update (billing portal link)', () => {
    it('returns an honest error when the workspace is missing', async () => {
      service = await buildService({ STRIPE_SECRET_KEY: 'sk_test_x' });
      workspace.findUnique.mockResolvedValue(null);
      const result = await service.update('ws-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace');
      expect(portalCreate).not.toHaveBeenCalled();
    });

    it('returns setup-required when no Stripe customer is attached', async () => {
      service = await buildService({ STRIPE_SECRET_KEY: 'sk_test_x' });
      workspace.findUnique.mockResolvedValue({ stripeCustomerId: null });
      const result = await service.update('ws-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Nenhum método de pagamento');
      expect(portalCreate).not.toHaveBeenCalled();
    });

    it('reports honest config error when Stripe is not initialized', async () => {
      service = await buildService({ STRIPE_SECRET_KEY: undefined });
      workspace.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      const result = await service.update('ws-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cobrança não configurada');
    });

    it('returns the billing-portal URL with the default return_url', async () => {
      service = await buildService({
        STRIPE_SECRET_KEY: 'sk_test_x',
        FRONTEND_URL: 'https://app.kloel.com',
      });
      workspace.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_x' });
      const result = await service.update('ws-1', {});
      expect(result).toMatchObject({ success: true, url: 'https://billing.stripe.com/session_x' });
      expect(portalCreate).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app.kloel.com/billing',
      });
    });

    it('honors a caller-supplied returnUrl', async () => {
      service = await buildService({ STRIPE_SECRET_KEY: 'sk_test_x' });
      workspace.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_y' });
      await service.update('ws-1', { returnUrl: 'https://app.kloel.com/settings/billing' });
      expect(portalCreate).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app.kloel.com/settings/billing',
      });
    });

    it('scopes the workspace lookup by id', async () => {
      service = await buildService({ STRIPE_SECRET_KEY: 'sk_test_x' });
      workspace.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' });
      portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_z' });
      await service.update('ws-77', {});
      expect(workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-77' } }),
      );
    });
  });
});
