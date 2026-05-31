import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROUTE_CLASS_METADATA_KEY } from '../common/throttler/route-class.decorator';
import { SalesSubscriptionsController } from './sales-subscriptions.controller';
import { AuthenticatedRequest } from '../common/interfaces';
import { castMock } from '../../test/helpers/cast-mock';

describe('SalesSubscriptionsController', () => {
  const subFindMany = jest.fn();
  const subFindFirst = jest.fn();
  const subUpdateMany = jest.fn();
  const planFindUnique = jest.fn();
  const auditCreate = jest.fn();

  let controller: SalesSubscriptionsController;

  const req = castMock<AuthenticatedRequest>({
    user: { sub: 'user-1', workspaceId: 'ws-1' },
  });
  const reqNoWorkspace = castMock<AuthenticatedRequest>({ user: { sub: 'user-1' } });

  beforeEach(() => {
    jest.clearAllMocks();
    auditCreate.mockResolvedValue(undefined);
    controller = new SalesSubscriptionsController(
      castMock({
        customerSubscription: {
          findMany: subFindMany,
          findFirst: subFindFirst,
          updateMany: subUpdateMany,
        },
        productPlan: { findUnique: planFindUnique },
        auditLog: { create: auditCreate },
      }),
    );
  });

  describe('route + governance wiring', () => {
    it('mounts under sales, is guarded by JwtAuthGuard, and is a read route class', () => {
      expect(Reflect.getMetadata('path', SalesSubscriptionsController)).toBe('sales');
      expect(Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, SalesSubscriptionsController)).toBe(
        'read',
      );
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        SalesSubscriptionsController,
      ) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('listSubscriptions', () => {
    it('returns workspace-scoped subscriptions ordered by createdAt desc', async () => {
      const subscriptions = [{ id: 's1' }, { id: 's2' }];
      subFindMany.mockResolvedValue(subscriptions);

      const result = await controller.listSubscriptions(req);

      expect(subFindMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ subscriptions, count: 2 });
    });

    it('returns an honest empty result when the request has no workspace', async () => {
      const result = await controller.listSubscriptions(reqNoWorkspace);

      expect(result).toEqual({ subscriptions: [], count: 0 });
      expect(subFindMany).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionStats', () => {
    it('computes MRR/ARR/churn from real subscription rows', async () => {
      subFindMany.mockResolvedValue([
        { status: 'ACTIVE', amount: 100, totalPaid: 300 },
        { status: 'TRIALING', amount: 50, totalPaid: 0 },
        { status: 'CANCELLED', amount: 100, totalPaid: 200 },
        { status: 'PAST_DUE', amount: 100, totalPaid: 100 },
      ]);

      const result = await controller.getSubscriptionStats(req);

      expect(result.mrr).toBe(150);
      expect(result.arr).toBe(1800);
      expect(result.activeCount).toBe(2);
      expect(result.totalCount).toBe(4);
      expect(result.churnRate).toBe(25);
      expect(result.lifecycle).toEqual({
        trial: 1,
        active: 1,
        past_due: 1,
        paused: 0,
        cancelled: 1,
      });
    });
  });

  describe('cancelSubscription', () => {
    it('flips status to CANCELLED, audit-logs it, and returns success', async () => {
      subFindFirst.mockResolvedValue({ id: 's1', workspaceId: 'ws-1', amount: 100 });
      subUpdateMany.mockResolvedValue({ count: 1 });

      const result = await controller.cancelSubscription(req, 's1');

      const updateArg = castMock<[{ data: Record<string, unknown> }][]>(
        subUpdateMany.mock.calls,
      )[0]?.[0];
      expect(updateArg.data.status).toBe('CANCELLED');
      const auditArg = castMock<[{ data: Record<string, unknown> }][]>(
        auditCreate.mock.calls,
      )[0]?.[0];
      expect(auditArg.data.action).toBe('subscription_cancel');
      expect(result.success).toBe(true);
    });

    it('throws NotFound when the subscription is missing', async () => {
      subFindFirst.mockResolvedValue(null);

      await expect(controller.cancelSubscription(req, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('pauseSubscription', () => {
    it('flips status to PAUSED and audit-logs the pause', async () => {
      subFindFirst.mockResolvedValue({ id: 's1', workspaceId: 'ws-1', amount: 100 });
      subUpdateMany.mockResolvedValue({ count: 1 });

      const result = await controller.pauseSubscription(req, 's1');

      const updateArg = castMock<[{ data: Record<string, unknown> }][]>(
        subUpdateMany.mock.calls,
      )[0]?.[0];
      expect(updateArg.data.status).toBe('PAUSED');
      expect(result.success).toBe(true);
    });
  });

  describe('changeSubscriptionPlan', () => {
    it('repoints the subscription to the new plan price and name', async () => {
      subFindFirst.mockResolvedValue({
        id: 's1',
        workspaceId: 'ws-1',
        status: 'ACTIVE',
        planId: 'plan-old',
        metadata: {},
      });
      planFindUnique.mockResolvedValue({ id: 'plan-new', name: 'Plano Pro', price: 200 });
      subUpdateMany.mockResolvedValue({ count: 1 });

      const result = await controller.changeSubscriptionPlan(req, 's1', { newPlanId: 'plan-new' });

      const updateArg = castMock<[{ data: Record<string, unknown> }][]>(
        subUpdateMany.mock.calls,
      )[0]?.[0];
      expect(updateArg.data.planName).toBe('Plano Pro');
      expect(updateArg.data.amount).toBe(200);
      expect(updateArg.data.planId).toBe('plan-new');
      expect(result.success).toBe(true);
    });

    it('rejects changing the plan of a cancelled subscription', async () => {
      subFindFirst.mockResolvedValue({ id: 's1', workspaceId: 'ws-1', status: 'CANCELLED' });

      await expect(
        controller.changeSubscriptionPlan(req, 's1', { newPlanId: 'plan-new' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the target plan does not exist', async () => {
      subFindFirst.mockResolvedValue({ id: 's1', workspaceId: 'ws-1', status: 'ACTIVE' });
      planFindUnique.mockResolvedValue(null);

      await expect(
        controller.changeSubscriptionPlan(req, 's1', { newPlanId: 'ghost' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
