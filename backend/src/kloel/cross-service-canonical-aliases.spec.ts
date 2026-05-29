import { AnalyticsService } from '../analytics/analytics.service';
import { BillingService } from '../billing/billing.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { CheckoutOrderService } from '../checkout/checkout-order.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { HealthService } from '../health/health.service';
import { PlanService } from '../plans/plan.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WhatsappService } from '../marketing/channels/whatsapp/whatsapp.service';
import { CodeAccessService } from './self-awareness/code-access.service';
import { WalletService } from './wallet.service';

/**
 * Cross-service capability-resolver wiring proofs.
 *
 * Each block proves a thin canonical-name alias exists on the real
 * NestJS service and delegates to the pre-existing canonical method
 * with the (workspaceId, args) signature expected by
 * `KloelDomainServiceResolver`. These aliases close the resolver gap
 * documented in `docs/architecture/CAPABILITY_MAP.md` (gap class B —
 * method-missing).
 */

describe('Cross-service canonical-name aliases (capability resolver wiring)', () => {
  describe('HealthService.snapshot()', () => {
    it('delegates to getHealth with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ status: 'OK', score: 99 });
      const result = await (
        HealthService.prototype.snapshot as (ws: string) => Promise<unknown>
      ).call({ getHealth: delegate }, 'ws-health-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-health-1');
      expect(result).toEqual({ status: 'OK', score: 99 });
    });
  });

  describe('WorkspaceService.getSettings()', () => {
    it('delegates to getAccountSettings with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'ws-1', name: 'Acme' });
      const result = await (
        WorkspaceService.prototype.getSettings as (ws: string) => Promise<unknown>
      ).call({ getAccountSettings: delegate }, 'ws-set-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-set-1');
      expect(result).toEqual({ id: 'ws-1', name: 'Acme' });
    });
  });

  describe('BillingService.status()', () => {
    it('delegates to getSubscription with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ plan: 'starter', active: true });
      const result = await (
        BillingService.prototype.status as (ws: string) => Promise<unknown>
      ).call({ getSubscription: delegate }, 'ws-bill-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-bill-1');
      expect(result).toEqual({ plan: 'starter', active: true });
    });
  });

  describe('DashboardService.summary()', () => {
    it('delegates to getStats with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ contacts: 10 });
      const result = await (
        DashboardService.prototype.summary as (ws: string) => Promise<unknown>
      ).call({ getStats: delegate }, 'ws-dash-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-dash-1');
      expect(result).toEqual({ contacts: 10 });
    });
  });

  describe('AnalyticsService.get()', () => {
    it('delegates to getDashboardStats with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ totalMessages: 100 });
      const result = await (
        AnalyticsService.prototype.get as (ws: string) => Promise<unknown>
      ).call({ getDashboardStats: delegate }, 'ws-an-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-an-1');
      expect(result).toEqual({ totalMessages: 100 });
    });
  });

  describe('CampaignsService.list()', () => {
    it('delegates to findAll with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      const result = await (
        CampaignsService.prototype.list as (ws: string) => Promise<unknown>
      ).call({ findAll: delegate }, 'ws-camp-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-camp-1');
      expect(result).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    });
  });

  describe('WalletService.getStatement()', () => {
    type GetStatementFn = (
      ws: string,
      args?: { page?: number; limit?: number; type?: string },
    ) => Promise<unknown>;

    it('delegates to getTransactionHistory with defaults when args omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [], total: 0 });
      await (WalletService.prototype.getStatement as GetStatementFn).call(
        { getTransactionHistory: delegate },
        'ws-wallet-1',
      );

      const calls = delegate.mock.calls as Array<[string, number, number, string | undefined]>;
      expect(calls[0]).toEqual(['ws-wallet-1', 1, 20, undefined]);
    });

    it('forwards page/limit/type when provided', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [], total: 0 });
      await (WalletService.prototype.getStatement as GetStatementFn).call(
        { getTransactionHistory: delegate },
        'ws-wallet-2',
        { page: 3, limit: 50, type: 'WITHDRAWAL' },
      );

      const calls = delegate.mock.calls as Array<[string, number, number, string | undefined]>;
      expect(calls[0]).toEqual(['ws-wallet-2', 3, 50, 'WITHDRAWAL']);
    });
  });

  describe('CodeAccessService.listDir()', () => {
    type ListDirFn = (ws: string, args?: { path?: string }) => unknown;

    it('delegates to list with empty path when args omitted', () => {
      const delegate = jest.fn().mockReturnValue([{ name: 'src' }]);
      const result = (CodeAccessService.prototype.listDir as ListDirFn).call(
        { list: delegate },
        'ws-code-1',
      );

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('');
      expect(result).toEqual([{ name: 'src' }]);
    });

    it('forwards args.path when provided', () => {
      const delegate = jest.fn().mockReturnValue([]);
      (CodeAccessService.prototype.listDir as ListDirFn).call({ list: delegate }, 'ws-code-2', {
        path: 'backend/src/kloel',
      });

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls[0]?.[0]).toBe('backend/src/kloel');
    });
  });

  describe('WalletService.withdraw()', () => {
    type WithdrawFn = (
      ws: string,
      args?: { amount?: number; bankInfo?: Record<string, unknown> },
    ) => Promise<unknown>;

    it('forwards amount and bankInfo to requestWithdrawal', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: true, transactionId: 'tx-1' });
      await (WalletService.prototype.withdraw as WithdrawFn).call(
        { requestWithdrawal: delegate },
        'ws-wd-1',
        { amount: 150, bankInfo: { bankCode: '341' } },
      );

      const calls = delegate.mock.calls as Array<[string, number, Record<string, unknown>]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-wd-1');
      expect(calls[0]?.[1]).toBe(150);
      expect(calls[0]?.[2]).toEqual({ bankCode: '341' });
    });

    it('passes empty bankInfo when args omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: false });
      await (WalletService.prototype.withdraw as WithdrawFn).call(
        { requestWithdrawal: delegate },
        'ws-wd-2',
      );

      const calls = delegate.mock.calls as Array<[string, number, Record<string, unknown>]>;
      expect(calls[0]?.[2]).toEqual({});
    });
  });

  describe('WalletService.anticipate()', () => {
    type AnticipateFn = (
      ws: string,
      args?: { amount?: number; installments?: number; feePercent?: number },
    ) => Promise<unknown>;

    it('forwards amount, installments and feePercent to requestAnticipation', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: true });
      await (WalletService.prototype.anticipate as AnticipateFn).call(
        { requestAnticipation: delegate },
        'ws-ant-1',
        { amount: 500, installments: 3, feePercent: 2.5 },
      );

      const calls = delegate.mock.calls as Array<[string, number, number, number]>;
      expect(calls[0]).toEqual(['ws-ant-1', 500, 3, 2.5]);
    });

    it('defaults feePercent to 3.0 when omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: true });
      await (WalletService.prototype.anticipate as AnticipateFn).call(
        { requestAnticipation: delegate },
        'ws-ant-2',
        { amount: 100 },
      );

      const calls = delegate.mock.calls as Array<[string, number, number | undefined, number]>;
      expect(calls[0]?.[3]).toBe(3.0);
      expect(calls[0]?.[2]).toBeUndefined();
    });
  });

  describe('WhatsappService.connect()', () => {
    type ConnectFn = (ws: string, args?: Record<string, unknown>) => Promise<unknown>;

    it('delegates to createSession with the same workspace and ignores args', async () => {
      const delegate = jest.fn().mockResolvedValue({ sessionId: 'sess-1' });
      const result = await (WhatsappService.prototype.connect as ConnectFn).call(
        { createSession: delegate },
        'ws-wa-1',
        { ignored: true },
      );

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-wa-1');
      expect(result).toEqual({ sessionId: 'sess-1' });
    });
  });

  describe('WhatsappService.getMessages()', () => {
    type GetMessagesFn = (
      ws: string,
      args?: { chatId?: string; limit?: number; offset?: number; downloadMedia?: boolean },
    ) => Promise<unknown>;

    it('forwards chatId and options to getChatMessages', async () => {
      const delegate = jest.fn().mockResolvedValue([{ id: 'msg-1' }]);
      await (WhatsappService.prototype.getMessages as GetMessagesFn).call(
        { getChatMessages: delegate },
        'ws-msg-1',
        { chatId: 'chat-abc', limit: 25, offset: 10, downloadMedia: true },
      );

      const calls = delegate.mock.calls as Array<
        [string, string, { limit?: number; offset?: number; downloadMedia?: boolean }]
      >;
      expect(calls[0]?.[0]).toBe('ws-msg-1');
      expect(calls[0]?.[1]).toBe('chat-abc');
      expect(calls[0]?.[2]).toEqual({ limit: 25, offset: 10, downloadMedia: true });
    });

    it('throws when chatId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (WhatsappService.prototype.getMessages as GetMessagesFn).call(
          { getChatMessages: delegate },
          'ws-msg-2',
        ),
      ).rejects.toThrow(/args\.chatId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('PlanService.configure()', () => {
    type ConfigureFn = (ws: string, args?: { planId?: string; name?: string }) => Promise<unknown>;

    it('splits planId from args and forwards rest as patch to update', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: true });
      await (PlanService.prototype.configure as ConfigureFn).call(
        { update: delegate },
        'ws-plan-1',
        { planId: 'plan-xyz', name: 'New name' },
      );

      const calls = delegate.mock.calls as Array<[string, string, Record<string, unknown>]>;
      expect(calls[0]?.[0]).toBe('ws-plan-1');
      expect(calls[0]?.[1]).toBe('plan-xyz');
      expect(calls[0]?.[2]).toEqual({ name: 'New name' });
    });

    it('throws when planId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (PlanService.prototype.configure as ConfigureFn).call({ update: delegate }, 'ws-plan-2'),
      ).rejects.toThrow(/planId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('CampaignsService.createBroadcast()', () => {
    type CreateBroadcastFn = (
      ws: string,
      args?: { name?: string; messageTemplate?: string },
    ) => Promise<unknown>;

    it('forwards name and rest of args to create', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'camp-1' });
      await (CampaignsService.prototype.createBroadcast as CreateBroadcastFn).call(
        { create: delegate },
        'ws-bc-1',
        { name: 'Black Friday', messageTemplate: 'Promo!' },
      );

      const calls = delegate.mock.calls as Array<
        [string, { name: string; messageTemplate: string }]
      >;
      expect(calls[0]?.[0]).toBe('ws-bc-1');
      expect(calls[0]?.[1]).toEqual({ name: 'Black Friday', messageTemplate: 'Promo!' });
    });

    it('throws when name is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (CampaignsService.prototype.createBroadcast as CreateBroadcastFn).call(
          { create: delegate },
          'ws-bc-2',
        ),
      ).rejects.toThrow(/args\.name is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('CheckoutOrderService.list()', () => {
    type OrderListFn = (
      ws: string,
      args?: { status?: string; page?: number; limit?: number },
    ) => Promise<unknown>;

    it('forwards status/page/limit to listOrders', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [], total: 0 });
      await (CheckoutOrderService.prototype.list as OrderListFn).call(
        { listOrders: delegate },
        'ws-ord-1',
        { status: 'PAID', page: 2, limit: 10 },
      );

      const calls = delegate.mock.calls as Array<
        [string, { status?: string; page?: number; limit?: number }]
      >;
      expect(calls[0]?.[0]).toBe('ws-ord-1');
      expect(calls[0]?.[1]).toEqual({ status: 'PAID', page: 2, limit: 10 });
    });

    it('passes empty filter object when args omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [] });
      await (CheckoutOrderService.prototype.list as OrderListFn).call(
        { listOrders: delegate },
        'ws-ord-2',
      );

      const calls = delegate.mock.calls as Array<[string, Record<string, unknown>]>;
      expect(calls[0]?.[1]).toEqual({});
    });
  });

  describe('CheckoutOrderService.get()', () => {
    type OrderGetFn = (ws: string, args?: { orderId?: string }) => Promise<unknown>;

    it('forwards orderId and workspace to getOrder', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'ord-9' });
      await (CheckoutOrderService.prototype.get as OrderGetFn).call(
        { getOrder: delegate },
        'ws-getord-1',
        { orderId: 'ord-9' },
      );

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls[0]).toEqual(['ord-9', 'ws-getord-1']);
    });

    it('throws when orderId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (CheckoutOrderService.prototype.get as OrderGetFn).call(
          { getOrder: delegate },
          'ws-getord-2',
        ),
      ).rejects.toThrow(/orderId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });
});
